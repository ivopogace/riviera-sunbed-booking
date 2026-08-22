# Venue availability calendar read Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve per-day free/total set counts for one venue over a caller-chosen date
window from a single public tourist read, so the calendar in #761 can tint days before
the tourist commits to one.

**Architecture:** The single significant decision is that this adds **no new module edge**.
The `venue ↔ availability` seam already exists as the dependency-inverted
`venue.spi.SetAvailabilityLookup`, implemented by `availability`'s
`JdbcSetAvailabilityLookup`; the range read is a **fourth method on that SPI** answering
only *taken counts per day* — the one fact `availability` owns — while `venue` keeps
owning the set total and therefore the `free = total − taken` arithmetic and the
gap-filling of days with no rows. The Modulith graph is unchanged and `venue` still never
imports `availability`.

**Persistence:** JDBC only (invariant #1). Reads `set_availability` and `set_position`;
**no migration** — the grouped query rides the existing
`set_availability_uniq (set_id, booking_date)` index.

**Source of intent:** GitHub issue #760 (slice A of epic #706); maintainer decisions
recorded at <https://github.com/ivopogace/riviera-sunbed-booking/issues/706#issuecomment-5382710655>.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
`GET /api/venues/*/availability` path collision with the operator-only daily read, R-1
below, and confirmed no Flyway number is claimed) · `riviera-plan-doc` (this template —
forced the module-ownership table that fixed where `free = total − taken` lives) · `tdd`
(each phase red-first: SPI IT → catalog IT → controller IT) · `riviera-review-overlay`
(review gate — due at ready-for-review; this line is updated when it runs) ·
`riviera-docs-freshness` (**ran** over `origin/main..HEAD` — 5 findings, all patched: three
"both/two reads" counts falsified by the third tourist read, the `availability` Job's
spi-answers enumeration, and the `venue` Job's missing calendar entry) · `riviera-modulith` (SPI-not-`api/` for the fourth method;
confirmed via `VenueApiRoleSplitTests` that evolving the tourist reads on `VenueCatalog`
is sanctioned) · `riviera-java-conventions` (typed-outcome-free `Optional` port return,
text-block SQL, package-private adapter, edge validation via
`InvalidApiRequestException`) · `postgres` (one `GROUP BY booking_date` instead of a
per-day N+1; confirmed no new index is warranted) · `riviera-local-debug` (cloud recipe:
`gradle --no-daemon`, JDK-25 toolchain, scoped test runs only) · `codebase-design`
(**loaded late — RV-PROC-1, F-8**: confirmed the range read joins the existing
`venue↔availability` seam rather than earning a fifth port, since all four methods answer
one purposeful conversation; and its **deletion test** is what condemned the redundant
`venueExists` query in F-6 — deleting it made no complexity reappear at any caller) ·
`domain-modeling` (**loaded late — RV-PROC-1, F-8**: added the **Availability calendar**
term to `CONTEXT.md`, because "availability" had come to mean two different questions —
one set on one date, versus counts per day across a window; judged **no ADR warranted**
against the three-part bar, the decision being additive and reversible with its rationale
already in `RESPONSIBILITIES.md` §`venue`).

**Branch:** `claude/sldc-706-3apmfc` — **cloud-session substitution** for
`feature/venue-availability-calendar-read`, per `riviera-sdlc` §Remote/cloud session
addendum. The designated remote branch stands in; the literal `feature/` branch is not
created.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with 4 sets, 2 of them held on one day of a 5-day window and 1
  on another, when the calendar read runs, then it returns 5 ascending entries reading
  `4/4, 2/4, 4/4, 3/4, 4/4` — days with no availability rows included at `free == total`.
  *Pinned by:* `VenueAvailabilityCalendarIT.countsEveryDayInTheWindowIncludingUntouchedOnes`
- [ ] **AC-2:** Given any day in the window, when the calendar read and `findVenueMap` are
  both asked about that day, then their free counts agree — one source of truth, no second
  derivation (invariant #2).
  *Pinned by:* `VenueAvailabilityCalendarIT.agreesWithTheSingleDayMapRead`
- [ ] **AC-3:** Given a window wider than 62 days, or `to` before `from`, when the read is
  requested, then it is rejected `400` with an `INVALID_REQUEST` `ApiProblem` body and no
  query is issued.
  *Pinned by:* `VenueAvailabilityCalendarControllerTest.rejectsAnOverwideWindow`,
  `…rejectsAnInvertedWindow`, `…acceptsTheWidestLegalWindow`
- [ ] **AC-4:** Given `from` and `to` are omitted, when the read is requested with the clock
  fixed at 2026-11-01T23:30Z — late enough that UTC still reads the 1st while Tirane has
  rolled to the 2nd — then the window is `[2026-11-03, 2026-11-16]` — tomorrow in
  `Europe/Tirane` through `from + 13` (invariant #6), derived from the injected `Clock`.
  *Pinned by:* `VenueAvailabilityCalendarControllerTest.defaultsToTomorrowInTiraneForTwoWeeks`
- [ ] **AC-5:** Given an unknown venue id, or a venue whose owning operator is not `ACTIVE`,
  when the read is requested, then the response is `404` — indistinguishable from each other
  (#693 fence).
  *Pinned by:* `VenueAvailabilityCalendarControllerTest.absentVenueIs404` (the edge half — both
  causes reach it as an empty `Optional`) and `VenueCatalogVisibilityIT.calendarReadIsEmptyForHiddenVenue`
  (the fence half, over the operator lifecycle)
- [ ] **AC-6:** Given the new endpoint path, when an anonymous client requests it, then it
  is publicly reachable, **and** the operator-only `GET /api/venues/{id}/availability` read
  remains `401`/`403` for that same anonymous client.
  *Pinned by:* `VenueAvailabilityCalendarControllerTest.isPublicAndDoesNotUngateTheOperatorRead`
- [ ] **AC-7:** Given the slice's structural change, when the structural net runs, then
  `ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests` and `VenueApiRoleSplitTests` all pass — the
  SPI method adds no module edge and no published-surface misplacement.
  *Pinned by:* the existing structural test classes, run as a batch.

## Non-goals

- Any frontend change — the calendar component is #761; the existing `<input type="date">`
  is untouched by this slice.
- The discovery date field on `home.html:87` and the two operator console date fields.
- Caching / CDN / `ETag` posture on the new endpoint — read-only and cheap; revisit only if
  #761 shows it matters.
- Fencing bookability. This endpoint reports availability; invariants #4 and #10 stay
  enforced where they already are.
- Per-pool breakdown. `total` counts both pools, exactly as `AvailabilitySummary` already
  means on the discovery card.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` No existing endpoint, port method, or query is
removed or re-pointed; every change is additive.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Path collision:** `GET /api/venues/*/availability` is already the operator-only daily availability-states read (`VenueAdminController:136`, gated at `SecurityConfig:313`). Reusing it would either leak the hold split publicly or silently operator-gate the tourist read — a security regression either way. | med | high | Use a distinct literal segment: **`GET /api/venues/{venueId}/availability-calendar`**. It cannot match the single-`*` operator pattern, so it falls through to the existing `GET /api/venues/**` → `permitAll` at `SecurityConfig:345` with **no SecurityConfig change**. AC-6 pins both halves. | claude | resolved at plan time (caught by the intake grill) |
| R-2 | Unbounded window → a caller asks for 10 years and the server materializes ~3,650 rows per request. | med | med | Hard cap of **62 days**, validated at the edge before any query, rejected `400 INVALID_REQUEST` via `InvalidApiRequestException` (§6b — no per-controller `@ExceptionHandler`). AC-3. | claude | mitigated in phase 2 |
| R-3 | Per-day N+1 — calling `takenOn` once per day in the window (up to 62 round-trips). | med | med | One `GROUP BY booking_date` query over the whole window; the SPI method takes the range, not a day. Reviewed against `postgres` query-patterns. AC-1's IT exercises a 5-day window through the single query. | claude | mitigated in phase 0 |
| R-4 | The calendar count and the map count disagree (two derivations of "free"). | low | high | The calendar never re-derives: the same `set_position` total and the same `set_availability` table feed both, and AC-2 asserts agreement directly rather than trusting it. Invariant #2. | claude | mitigated in phase 1 |
| R-5 | Timezone drift — defaulting `from` off the JVM default zone rather than `Europe/Tirane` (invariant #6). | low | med | Reuse `VenueReadController`'s existing `tomorrowInTirane()` idiom off the injected UTC `Clock`; AC-4 asserts it with a **fixed** clock, not wall time. | claude | mitigated in phase 2 |
| R-6 | Visibility fence forgotten — a venue whose owner is not `ACTIVE` answers on the new read while being absent from the other two (#693). | med | high | The fence lives in `JdbcVenueCatalog`, consulted first, exactly as `findVenueMap` does. AC-5. | claude | mitigated in phase 1 |
| R-7 | Adding a method to `VenueCatalog` re-grows the god-port that #94 split. | low | med | `VenueApiRoleSplitTests` is a dependency-direction assertion, not a method freeze, and its own Javadoc states "legitimate evolution of the tourist reads stays free". This read has exactly one consumer — the `venue` module's own REST adapter — i.e. the same tourist-read role. AC-7. | claude | accepted at plan time |
| R-8 | No Flyway migration in scope, so no `V<n>` to claim. In-flight check: only Dependabot PRs are open; no feature branch touches `db/migration`. | — | — | Nothing to renumber. | claude | n/a |

## Open questions / Assumptions

*(none open — the four blocking decisions were settled by the maintainer before planning;
see the #706 comment linked under Source of intent.)*

### Resolved

- **API shape / range** — new endpoint, caller-chosen window, server-capped. Maintainer
  decision, 2026-08-22 (#706 comment 5382710655).
- **Fidelity** — serve `free`/`total` counts; the tint is derived client-side in #761.
  Counts are not more expensive to serve than a tint (same single `GROUP BY`), so the
  cheaper-looking option bought nothing. Same decision record.
- **Endpoint path** — `availability-calendar`, not `availability`, forced by R-1. Decided
  at plan time from the code, not escalated: the collision makes the alternative unsafe,
  so there was no product fork to put to the maintainer.
- **Wire shape** — the port speaks `LocalDate` + the existing `AvailabilitySummary`; the
  `adapter/in` view flattens to `{date, free, total}` with the date as an ISO string,
  following `MyBookingView`'s precedent of pinning the date format at the edge rather
  than relying on a Jackson default.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** **none — this slice is
  read-only.** It adds no writer to the table and takes no locks.
- **Uniqueness guarantee:** unchanged — `set_availability_uniq (set_id, booking_date)`
  remains the constraint making a set holdable by at most one party per date. This slice
  neither relies on it for correctness nor weakens it; it only *reads* through the index
  it provides.
- **Concurrency strategy:** N/A for a read. The count is a snapshot at query time and is
  explicitly **not** a booking guarantee — a day reading `1 free` may be full by the time
  the tourist claims, and the claim path (`AvailabilityClaim`, `INSERT … ON CONFLICT DO
  NOTHING`) remains the only thing that decides. This is the same contract the existing
  discovery-card count already carries, and #761's UI must not present it as a hold.
- **Pool rule (invariant #3):** `total` counts **both** pools, matching
  `AvailabilitySummary`'s existing documented meaning; the online-pool restriction applies
  later, at the map/claim. The calendar is a "how busy is this day" signal, not a
  bookable-set count — stated on the new port method's Javadoc so #761 cannot misread it.
- **Cutoff rule (invariant #4):** untouched. The read answers past and today alike; the
  evening-before cutoff and the service-day-open fence stay where they are enforced. #761
  owns the display-only exclusion of today/past.
- **Pinning test:** N/A — no concurrency introduced. The existing
  `ConcurrentReservationIT` continues to own invariant #2's race proof; AC-2 instead pins
  the property this slice *can* break, namely that the new read agrees with the existing
  one.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | Owns the set layout (hence `total`), the tourist read model, and the REST surface the calendar consumes. |
| M-2 | `availability` | existing | `SetAvailability` | Sole owner of `set_availability`; answers "how many of these sets are taken per day" and nothing else. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.spi` (**driven**, not `api/`) | `SetAvailabilityLookup#takenCountsBetween(Collection<SetId>, LocalDate, LocalDate)` → `Map<LocalDate, Integer>` | `venue.vocabulary.SetId` | implemented by `availability`'s `JdbcSetAvailabilityLookup`; called by `venue`'s `JdbcVenueCatalog` |
| NI-2 | `venue.api` | `VenueCatalog#availabilityBetween(VenueId, LocalDate, LocalDate)` → `Optional<List<DailyAvailability>>` | `venue.vocabulary.VenueId`, `venue.vocabulary.DailyAvailability`, `venue.vocabulary.AvailabilitySummary` | `venue`'s own `VenueReadController` only (tourist-read role, per `VenueApiRoleSplitTests`) |

NI-1 stays in `spi/` and not `api/` because it is an **implement-me** interface owned by
its consumer — the same inversion #44 established to keep `venue → availability` from
closing a cycle. No `allowedDependencies` change: `availability` is already granted
`venue::spi` and `venue::vocabulary`.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published or consumed.` A read adds no state change to announce; the
five-event inventory in `CLAUDE.md` is unchanged.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| "how many of these sets are held on each day in `[from, to]`" | `availability` | `availability` Job: owns the per-`(set, date)` source-of-truth state and is *the only reader/writer of that table*. Not `venue` — `venue`'s Not-My-Job is exactly reading `set_availability` directly, which is why `SetAvailabilityLookup` exists at all. |
| "`free = total − taken`, and the gap-fill for days with no rows" | `venue` | `venue` Job: owns the set layout, so it alone knows `total`; `AvailabilitySummary` (free/total) is already a `venue.vocabulary` type computed this way in `listVenues`. Not `availability` — it does not know how many sets a venue has, and giving it the total would hand it the layout, which is `venue`'s Job. |
| "the public `GET /api/venues/{id}/availability-calendar` surface" | `venue` | `venue` Job: owns the tourist read model and already hosts `VenueReadController` for the other two tourist reads. Not `availability` — its only driving adapter is the operator-asserted `StaffAvailabilityController`; a public tourist endpoint there would put the tourist read model in the wrong context. |
| "window validation (cap + inversion)" | `venue` `adapter/in` | Edge input validation per `riviera-java-conventions` §6b — the controller is the only code that has inspected request input, so it is the only code entitled to produce `400 INVALID_REQUEST`. Not the port and not `availability`. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, computed, or moved; no ledger row is
touched. `MoneyView` does not appear on the new surface.

## Angular — frontend surfaces touched

`N/A — backend-only.` The frontend consumer is #761.

## FE↔BE contract

- **New/changed endpoints:** `GET /api/venues/{venueId}/availability-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
  → `200 [{ "date": "2026-11-02", "free": 21, "total": 24 }, …]` (ascending, inclusive of
  both bounds), `400 INVALID_REQUEST` on an inverted or over-wide window or a malformed
  date, `404` for an unknown or non-visible venue. Both params optional; defaults are
  tomorrow in `Europe/Tirane` and `from + 13`.
- **Client typing:** none in this slice. #761 adds a hand-written typed method on
  `frontend/src/app/venue/venue.service.ts` mirroring the shape above; never `as any`.
- **Money/date on the wire:** no money. Dates are ISO `YYYY-MM-DD` strings for the booking
  date (invariant #6), pinned at the edge by the `adapter/in` view rather than left to a
  Jackson default — the same choice `MyBookingView` makes.

## Execution status

**Stage pointer:** `CI gate — F-4 fixed and pushed; awaiting the re-run, then the Sonar gate`

**Next action:** wait for CI on the F-4 fix. **The Sonar gate has not run for this slice
yet** — the `sonar` job `needs: [backend, frontend]`, so the red backend left it
`skipped`, which per `pr-gates.md` §2 means *unanalyzed*, not *clean*. Once CI is green,
pull the issue + measures list (confirming `measures` is populated and the analysis
check itself concluded `success`, with a cache-bust) and clear every entry.

> **Review-gate degradation, declared rather than substituted silently.** The
> `code-review` plugin's procedure is a parallel subagent fan-out, and this session is
> operating under an instruction not to spawn subagents. The bank was therefore walked by
> a single reviewer (this session) against `riviera-review-overlay`'s
> `backend-conventions.md` + `fe-be-contract.md`, item by item, rather than by the
> plugin's five independent agents. That is a real review — it produced F-1..F-3 — but it
> is **not** the plugin's fan-out, so per `riviera-sdlc` `references/pr-gates.md` §1 the
> PR's review-gate checkbox stays **unticked** and the degradation is stated in the PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — SPI range read (`takenCountsBetween` + JDBC impl) | ✅ | `842ebc2` |
| 1 — `VenueCatalog.availabilityBetween` + `DailyAvailability` | ✅ | `b1b8f4d` |
| 2 — public endpoint + window validation | ✅ | `2234ca5` |
| 3 — close-out (docs freshness, plan finalization) | ⏳ | `b770a31` (docs-freshness); plan finalized in the PR's last commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate | `availabilityBetween` built its day list with `from.datesUntil(to.plusDays(1))`. At `from == to == LocalDate.MAX` the window passes the edge's 62-day cap, then the exclusive `to + 1` throws `DateTimeException` — a crafted request turning a 400-class input into a 500. | fixed — counts forward with `LongStream.range(0, days)`, which cannot overflow; pinned by `VenueAvailabilityCalendarIT.widestWindowIsCountedWithoutOverflowing` |
| F-2 | review gate | The port documented "`to` must not precede `from`" but only enforced it incidentally, via `datesUntil`'s own throw — which the F-1 fix would have silently removed, leaving an inverted window answering an empty list instead of failing. | fixed — the precondition is now an explicit `IllegalArgumentException`, pinned by `…anInvertedWindowIsACallerBug` |
| F-5 | CI (repo hygiene) | RV-STYLE-1: the reason I wrote on F-4's `DECLARED_REACHABLE` line ran to two lines, and an inline comment is one line or it is not written. **The local guard did not catch it because it never ran** — the verification command chained `check-plan-file-structure && check-inline-comments; echo "guards ok"`, the first guard failed, `&&` short-circuited the second, and the unconditional `echo` printed success anyway. | fixed — comment shortened to one line; and the verification habit corrected: each guard is now run separately with its own exit code reported, never `&&`-chained behind another and never followed by an unconditional success echo |
| F-4 | CI (backend) | `EndpointRoleGateCoverageTest.everyMappedEndpointIsGatedOrDeclaredReachable` failed: it enumerates every mapped endpoint and requires each to be either gated in `SecurityConfig` or named in `DECLARED_REACHABLE`. The new public endpoint was neither — it relies on the `GET /api/venues/**` `permitAll` fall-through, which is exactly what that guard refuses to accept silently. **A full-suite-only failure**: every scoped batch was green, which is the blind spot `riviera-local-debug` documents. | fixed — declared in `DECLARED_REACHABLE` with its reason, the deliberate reviewable act the test asks for; reproduced red locally before the fix and green after |
| F-8 | review gate (fan-out: prior-PR reviewer) | **RV-PROC-1** — *Skills consulted* omitted `codebase-design` and `domain-modeling`, though the routing table's backend row requires both alongside `riviera-modulith` for a new `api`/`spi` port, JDBC adapter, or controller. Evidenced as the repo's recurring miss (#447, #459, #516, #541). | fixed — both skills **loaded and applied**, not merely named: `codebase-design` re-vetted the seam and supplied the deletion-test argument behind F-6; `domain-modeling` added the **Availability calendar** glossary term and ruled out an ADR with a stated reason |
| F-7 | review gate (fan-out: Javadoc reviewer) | `DEFAULT_WINDOW_DAYS`'s Javadoc said it applied "when the caller names neither bound", but the code uses it whenever `to` alone is omitted — a case my own `anOmittedEndDefaultsToThirteenDaysAfterTheGivenStart` test exercises, so the comment was falsified by the suite that shipped with it. | fixed — reworded to "when the caller does not name `to`" |
| F-6 | review gate (fan-out: Javadoc reviewer) | `venueExists` was dead code. `operator_venue.venue_id` is `PRIMARY KEY REFERENCES venue(id)` and `hasActiveOwner` requires such a row, so `isVisible` true ⇒ the venue exists; short-circuit `\|\|` means the check is only ever reached when it must return `true`. It cost a round-trip per successful request and could never change the outcome. **My own single-reviewer pass had considered and kept it**, on a "makes the 404 a property of this method" argument I never verified against the fence's actual semantics. | fixed — removed; the 404 stays pinned by `unknownVenueIsEmpty`, and the fail-closed rule it now leans on is pinned by `VenueCatalogVisibilityIT.unownedVenueIsHiddenFailClosed` |
| F-3 | review gate | Two doc/hygiene slips: the `DailyAvailability` import sat out of alphabetical order in `JdbcVenueCatalog`, and the plan's AC-1 still described a 24-set venue while the shipped fixture seeds 4. | fixed — import reordered; AC-1 rewritten to the shipped fixture |

**Docs-freshness run** (close-out step 5, run pre-merge as the cheapest moment):
`origin/main..HEAD`, **5 findings, all patched in `b770a31`** —
`venue/api/VenueCatalog.java:21` "Both reads fence" → all three;
`venue/adapter/in/VenueReadController.java:26` "Two reads:" → three;
`RESPONSIBILITIES.md` §`venue` standing rule "both `VenueCatalog` reads" → all three;
`RESPONSIBILITIES.md` §`availability` Job, whose spi-answers enumeration listed two → three;
and `RESPONSIBILITIES.md` §`venue` Job, which now records the calendar read and where its
arithmetic lives. The post-fix re-run is clean: the three remaining "both reads" hits are
about photo views, `VenuePhotos`, and `payout`'s `operator::api` reads, all still true.
`CONTEXT.md` needed nothing — the calendar is a new read, not a new domain concept, and its
**Availability** entry stays accurate.

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — the fourth method, `takenCountsBetween`
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — its grouped-query implementation
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/DailyAvailability.java` — new: one day's `AvailabilitySummary`
- `platform/src/main/java/ai/riviera/platform/venue/api/VenueCatalog.java` — the `availabilityBetween` tourist read
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — its implementation (visibility fence, id-only set query, gap fill)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/DailyAvailabilityView.java` — new: the flat wire record
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueReadController.java` — the new endpoint + window validation
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java` — SPI range cases
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — its `SetAvailabilityLookup` fake implements the new method
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — its `VenueCatalog` stub implements the new method
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — declares the new public endpoint as reachable, with its reason
- `platform/src/test/java/ai/riviera/platform/venue/VenueCatalogVisibilityIT.java` — the #693 fence, extended to the new read
- `platform/src/test/java/ai/riviera/platform/venue/VenueAvailabilityCalendarIT.java` — new: AC-1, AC-2
- `platform/src/test/java/ai/riviera/platform/VenueAvailabilityCalendarControllerTest.java` — new: AC-3, AC-4, AC-6 (web slice, root package like every other web-slice test)
- `docs/plans/venue-availability-calendar-read.md` — this plan
- `RESPONSIBILITIES.md` — the `venue`/`availability` contract lines the slice changes
- `CONTEXT.md` — the **Availability calendar** glossary term (`domain-modeling`, F-8): "availability" had come to mean two different questions
- `.claude/settings.json` — **not slice code.** Maintainer-requested allowlist entries so the
  review gate's subagents and its `gh` REST calls stop prompting: `Bash(gh api *)`,
  `Bash(gh pr diff *)`, `Bash(gh pr view *)`, `Task`. Note `gh api` is write-capable (the
  review plugin posts its comment with `gh api -X POST …/comments`), and `Task` silences the
  permission prompt only — it does not satisfy a session instruction to ask before spawning
  subagents. Separable from #760.
- `.claude/skills/riviera-sdlc/references/pr-gates.md` — **not slice code.** A tooling-doc
  correction made at the maintainer's request mid-slice: the §1 `gh` substitution table was
  wrong about `gh pr view` (field-dependent, not blocked outright), missed `gh pr checks`,
  and did not record that job logs fail at the agent proxy rather than the GitHub gateway.
  All three were established by probe during this slice's CI rounds. Separable from #760 if
  a reviewer would rather it landed on its own.

---

## Phase 0 — SPI range read

**Files:** Modify `venue/spi/SetAvailabilityLookup.java` · Modify
`availability/adapter/out/JdbcSetAvailabilityLookup.java` · Test
`platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java`

- [x] **Step 1: Write the failing test** — add to `AvailabilityLookupIT`: three sets, two
  held on one date and one on another inside a five-day window, assert
  `takenCountsBetween` returns exactly the two dates with counts `2` and `1` (untouched
  days absent, not zero-valued), that a set held outside the window is excluded, and that
  an empty input returns an empty map without a query.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*AvailabilityLookupIT*"` → FAIL (method does not exist / compile error).
- [x] **Step 3: Minimal implementation** — the interface method plus one grouped query:

```sql
SELECT booking_date, COUNT(*) AS taken
FROM set_availability
WHERE set_id IN (:ids)
  AND booking_date BETWEEN :from AND :to
GROUP BY booking_date
```

- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — see the log below.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `VenueCatalog.availabilityBetween`

**Files:** Create `venue/vocabulary/DailyAvailability.java` · Modify
`venue/api/VenueCatalog.java` · Modify `venue/adapter/out/JdbcVenueCatalog.java` · Test
`platform/src/test/java/ai/riviera/platform/venue/VenueAvailabilityCalendarIT.java`

- [x] **Step 1: Write the failing test** — `VenueAvailabilityCalendarIT` covering AC-1
  (every day present, gaps filled at `free == total`) and AC-2 (agreement with
  `findVenueMap` for the same day), plus the #693 fence returning `Optional.empty()`.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*VenueAvailabilityCalendarIT*"` → FAIL.
- [x] **Step 3: Minimal implementation** — visibility fence first, then an **id-only** set
  query, then one `takenCountsBetween` call, then `from..to` iterated with
  `taken.getOrDefault(day, 0)`.
- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass** — see the log below.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — public endpoint + window validation

**Files:** Create `venue/adapter/in/DailyAvailabilityView.java` · Modify
`venue/adapter/in/VenueReadController.java` · Test
`platform/src/test/java/ai/riviera/platform/venue/VenueAvailabilityCalendarControllerTest.java`

- [x] **Step 1: Write the failing test** — `VenueAvailabilityCalendarControllerTest` covering
  AC-3 (over-wide + inverted → `400 INVALID_REQUEST`), AC-4 (fixed-clock defaults), AC-5
  (unknown and non-visible → `404`), AC-6 (public, and the operator read stays gated).
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*VenueAvailabilityCalendarControllerTest*"` → FAIL (404, no mapping).
- [x] **Step 3: Minimal implementation** — the `@GetMapping`, the
  `MAX_WINDOW_DAYS = 62` guard throwing `InvalidApiRequestException` **before** any query,
  and the flat view mapping.
- [x] **Step 4: Run it, verify it passes** — same command → PASS; then the structural net.
- [x] **Step 5: Generalization-audit pass** — see the log below.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-22 | Phase 0 | Every `SetAvailabilityLookup` method that builds an `IN (:ids)` list — the mechanism that must short-circuit on empty input rather than emit `IN ()`. | `grep -n "IN (:ids)" platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` | 4 (`takenOn`, `anyClaimsFrom`, `statesOn`, the new `takenCountsBetween`) | All four short-circuit; the new one follows the existing three. No pre-existing gap. |
| 2026-08-22 | F-4 (CI fix) | Every test that enumerates Spring's mapped endpoints — the mechanism that makes a test break when *any* endpoint is added, whether or not it resembles the one that failed. | `git grep -ln "RequestMappingHandlerMapping" -- platform/src/test` | 3 files: `EndpointRoleGateCoverageTest`, `AdminSurfaceRoleGateTest`, and their shared `EndpointProbes` helper. | Only the first needed a change. `AdminSurfaceRoleGateTest` filters to the `/api/admin/` namespace, so a `/api/venues/**` endpoint is out of its scope by construction — checked rather than assumed, since it carries a near-identical allowlist that looks like it would need the same entry. |
| 2026-08-22 | Phase 2 | Every place in production code that turns the injected `Clock` into a civil date — the mechanism that must name a zone rather than inherit the JVM default (invariant #6). Enumerated across the whole backend, not just the controller being edited. | `git grep -n "LocalDate.ofInstant\|LocalDate.now(" -- platform/src/main/java` (and `LocalDate.now()` with no argument, separately) | 11 sites across `availability`, `booking`, `customer`, `payout`, `venue`; zero zone-less `LocalDate.now()`. | Clean as found — all 11 name `TIRANE` explicitly. The new handler adds no twelfth derivation: it reuses `VenueReadController`'s single `tomorrowInTirane()` helper, which is site 9. |
| 2026-08-22 | Phase 1 | Every public method on `JdbcVenueCatalog` — the mechanism that must consult the #693 visibility fence before answering a tourist about one venue. Enumerated from the class's own method list, not from the reads that resembled the new one. | `grep -n "public .*(" …/JdbcVenueCatalog.java` then `grep -n "visibility\.\|onlyVisible" …/JdbcVenueCatalog.java` | 9 methods: 3 tourist-catalogue reads (`findVenueMap`, `listVenues`, the new `availabilityBetween`) — all three fence; 6 sibling-role reads on `VenueRates`/`SetBookingFacts` — none fence. | Correct as found. The 6 are booking/payout-time reads, and `booking` fences its own reserve paths (CLAUDE.md §`operator`) — fencing them here would hide a set from the claim path when a venue is suspended mid-booking. **One real gap closed:** `VenueCatalogVisibilityIT` is the fence's test home and covered only the two older reads, so the new one was fenced but unpinned; it now has a case there, and the class doc says "all three" rather than "both". |
| 2026-08-22 | Phase 0 (test cross-contamination bug) | Every method whose SQL date predicate is **not** a single-day equality — the mechanism that makes its IT sensitive to rows a *sibling* test left in the shared Testcontainers DB, not just to its own seed. Found by grepping the date predicates rather than by looking at tests that resembled the one that failed. | `grep -n "booking_date" platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` | 2 (`anyClaimsFrom` → `>= :from`; the new `takenCountsBetween` → `BETWEEN`). The other two (`takenOn`, `statesOn`) are `= :date` and are immune. | **Both fixed.** The new range tests seed a dedicated set trio (`calendarSets()`, `OFFSET 3`); `anyClaimsFromCountsOnlyHoldsOnOrAfterTheCutoff` was passing only because nothing yet marked its shared set on a later day — it now takes its own set (`claimProbeSet()`, `OFFSET 6`), so the next test to seed a late date cannot silently decide its result. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `gradle --no-daemon --console=plain test --tests "*VenueAvailabilityCalendarIT*"` → PASS.
- [ ] **AC-2:** Same run, `agreesWithTheSingleDayMapRead` → PASS.
- [ ] **AC-3:** Run `gradle --no-daemon --console=plain test --tests "*VenueAvailabilityCalendarControllerTest*"` → PASS.
- [ ] **AC-4:** Same run, `defaultsToTomorrowInTiraneForTwoWeeks` → PASS.
- [ ] **AC-5:** Same run, both 404 cases → PASS.
- [ ] **AC-6:** Same run, `isPublicAndDoesNotUngateTheOperatorRead` → PASS.
- [ ] **AC-7:** Structural-net batch (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`, `*PublishedSurfacePlacementArchitectureTests*`, `*VenueApiRoleSplitTests*`) → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; read-only slice, justified in place (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — both explicitly unchanged, stated on the port Javadoc.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no events (invariant #11).
- [ ] **Payment/payout** N/A — no money on the surface (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: UTC `Clock`, `Europe/Tirane` for the date default (invariant #6).
- [ ] Booking codes not involved (invariant #7).
- [ ] No schema change, so no Flyway migration is due (invariant #12).
- [ ] **Frontend** N/A — backend-only slice.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — this doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` plus `riviera-review-overlay`.
