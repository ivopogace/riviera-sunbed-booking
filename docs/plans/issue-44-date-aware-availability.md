# Issue #44 — Beach map renders live per-`(set, date)` availability Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, routed via `riviera-sdd`.
> Fullstack slice; phases pull `postgres` (V6 migration), `riviera-modulith` +
> `riviera-java-conventions` + `codebase-design` (the read seam), `angular-developer` +
> the angular-cli MCP (the map date control). Invariant numbers refer to `CLAUDE.md`.

**Goal:** Make the U1 beach-map read (`GET /api/venues/{id}`) **date-aware** and source each
set's `FREE`/`TAKEN` from the authoritative `set_availability(set_id, booking_date)` table
(invariant #2), not the `set_position.seed_availability` placeholder. A set booked online for
date *D* must render as taken on the map for *D* (and free for other dates). The Angular map
gains a date control whose selected date drives both the map's availability and the booking
dialog's date, so the two always agree (AC-3). This closes the U1→U2→U3 breadcrumb
("U2 sources it from the authoritative availability table without changing this shape") that
was deferred through U2 (#5) and U3 (#6).

**Architecture — the seam decision (the one significant call).** The read must combine two
modules' data: `venue` owns the static beach-map layout (`set_position`); `availability` owns
the live per-`(set, date)` truth (`set_availability`). The established structure already has
**`availability` → `venue::api`** (the claim's pool check, U2). A naïve "venue reads
availability" would be **either** a boundary violation (#11, if `JdbcVenueCatalog` queried
`set_availability` directly) **or** a Spring-Modulith **cycle** (`venue → availability →
venue`, rejected by `ModularityTests`). We resolve it with **dependency inversion**:

- `venue.api` declares a focused query port **`SetAvailabilityLookup`** — *the one fact the
  venue map lacks* ("which of these sets are taken on date D?").
- the **`availability`** module **implements** it with a JDBC adapter (it already legally
  depends on `venue::api`; this is the existing allowed direction — no new dependency, no
  cycle). Availability stays the single source of truth and the only reader/writer of its own
  table.
- `venue`'s `JdbcVenueCatalog.findVenueMap(VenueId, LocalDate)` keeps **owning map assembly**
  (locality, per `codebase-design`): it loads the layout, calls the lookup, and overlays
  `TAKEN`/`FREE`. The endpoint stays in `venue`; no controller moves.

`ModularityTests.verify()` is static analysis: it sees `venue` referencing its own
`venue.api.SetAvailabilityLookup` (intra-module) and `availability` referencing
`venue.api.SetAvailabilityLookup` (the existing `availability → venue::api`). No `venue →
availability` reference exists, so there is **no cycle**. The Spring bean graph is also
acyclic (the lookup adapter depends only on `JdbcClient`, not on `VenueCatalog`).

**Persistence:** JDBC only (invariant #1). New Flyway migration **`V6__drop_seed_availability.sql`**
drops the now-dead `set_position.seed_availability` column (and its `CHECK`). The lookup reads
`set_availability` with `WHERE booking_date = :date AND set_id IN (:ids)` — no new table, no
new index needed (the existing `UNIQUE(set_id, booking_date)` composite index serves it).

**Default date & FE↔BE agreement:** when no `date` query param is given, the read defaults to
**tomorrow in `Europe/Tirane`** (invariant #6), computed from the injected UTC `Clock`. The
Angular map computes the same default, owns the selected date, re-fetches on change, and passes
it into the booking dialog — so map and dialog agree by construction (AC-3). The server cutoff
(invariant #4) remains authoritative for whether a date is actually bookable.

**Source of intent:** GitHub issue **#44**; follows #6 (U3), depends on #5 (U2, merged). Design
spec `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`; the deferral is
recorded in `docs/plans/u2-availability-claim.md` (drift note) and `docs/plans/u3-...`.

**Skills consulted:** `riviera-modulith` (the dependency-inversion seam: `SetAvailabilityLookup`
in `venue.api` implemented by `availability`, keeping `verify()` acyclic — the core decision).
`codebase-design` (the lookup is a deep port — tiny interface `takenOn(setIds, date) →
Set<SetId>` hiding the SQL; map assembly stays local to `venue`; two adapters — real + test
stub — make it a real seam). `riviera-java-conventions` (records, `Optional`-free `Set` return,
`JdbcClient` + text-block SQL, package-private adapter, constructor injection, `LocalDate`/
`Europe/Tirane`, no JPA). `postgres` (drop the dead column via a forward migration; the
`set_id IN (:ids)` + date predicate is served by the existing composite unique index — no new
index). `angular-developer` + angular-cli MCP (`get_best_practices`, v22: signal-based date
control, `input()` for the dialog date, `class`/`style` bindings, a11y for the date field, no
`new Date()` in templates). `riviera-plan-doc` (this doc). `tdd` (red→green per phase).

**Branch:** `claude/riviera-sdd-issue-44-molx4o` (harness-designated; checked out).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a set with **no** `set_availability` row for date *D*, when
  `findVenueMap(venueId, D)` is read, then that set's `availability` is `FREE` — sourced from
  `set_availability`, never from `seed_availability`. *Pinned by:*
  `VenueReadControllerIT.unbookedSetIsFreeForDate`.
- [ ] **AC-2:** Given a set booked (a `set_availability` row) for date *D*, when the venue is
  read for *D* then that set is `TAKEN`, and when read for a different date *D2* then the same
  set is `FREE`. *Pinned by:* `VenueReadControllerIT.bookedSetIsTakenOnItsDateAndFreeOnAnother`.
- [ ] **AC-3:** Given no `date` query param, when the venue is read, then the effective date is
  **tomorrow in `Europe/Tirane`**; given `?date=YYYY-MM-DD`, that date is used. *Pinned by:*
  `VenueReadControllerIT.defaultsToTomorrowTirane` (default) +
  `bookedSetIsTakenOnItsDateAndFreeOnAnother` (explicit `?date`).
- [ ] **AC-4:** Given the Angular map, when it loads it requests `/api/venues/{id}?date=<tomorrow>`,
  and when the user picks a date it re-fetches for that date and opens the booking dialog
  pre-set to the same date. *Pinned by:* `venue-map.spec.ts` (`requests …with the default date`,
  `re-fetches on date change`, `passes the selected date to the dialog`).
- [ ] **AC-5:** Given the whole module graph, when `ApplicationModules.verify()` runs, then the
  boundaries hold (`availability → venue::api` only; no `venue → availability`; no cycle).
  *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [ ] **AC-6:** Given `V6`, when migrations run on a fresh DB, then `set_position` has **no**
  `seed_availability` column and the 24 demo sets still load. *Pinned by:*
  `VenueSeedMigrationIT` (updated).
- [ ] **AC-7:** CI is green (backend build + tests + scans; frontend build + tests + a11y).

## Non-goals

- **No `STAFF_MARKED` write path / staff tap-to-mark** (U8). The lookup treats *any*
  `set_availability` row (`BOOKED_ONLINE` **or** `STAFF_MARKED`) as `TAKEN`, so it is already
  correct when U8 lands; U8 only adds a writer.
- **No cancellation/free path** (U6) — freeing a set (DELETE the row) is out of scope; this
  slice only *reads*.
- **No cutoff-aware "next bookable day"** — the default is plain tomorrow (Europe/Tirane); the
  server cutoff (#4) still governs booking. (Decided with the user.)
- **No new pool/price logic** — `fromPrice` and pool rendering are unchanged.
- **No seeding of demo `set_availability` rows.** Real availability is per-date (tomorrow
  moves); a static seed cannot express it. The demo map shows all-free by default (honest — the
  demo venue has no bookings); AC-2 is proven by an IT that inserts a row for a concrete date.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The read seam introduces a `venue → availability` Modulith **cycle** | med | high | dependency inversion: port in `venue.api`, impl in `availability`; `ModularityTests` is the gate (AC-5) | agent | open |
| R-2 | The lookup reaches into venue's `set_position` table (boundary leak #11) | low | med | lookup queries **only** `set_availability`, filtered by the set-ids the caller passes; no venue-table SQL in `availability` | agent | open |
| R-3 | Dropping `seed_availability` breaks the demo seed (V3 still INSERTs it) | med | low | V3 ran before V6 on every DB; V6 is a forward drop; `set_position_avail_check` is auto-dropped with the column; `VenueSeedMigrationIT` updated to stop asserting the column | agent | open |
| R-4 | Timezone bug: default date computed in the JVM/browser zone, not `Europe/Tirane` (#6) | med | med | BE computes `LocalDate.ofInstant(clock.instant(), Europe/Tirane).plusDays(1)`; FE formats via `Intl…{timeZone:'Europe/Tirane'}`; both unit-tested with a fixed instant | agent | open |
| R-5 | `findVenueMap` signature change silently breaks `VenueCatalog` stubs | low | low | compiler catches it; update `CreateBookingServiceTest.FakeCatalog` + `WebCorsConfigTest.StubVenueCatalog` | agent | open |
| R-6 | Map and dialog dates drift apart (AC-3 fails) | low | med | map is the single owner of the date; dialog takes it as an `input()` and drops its own `defaultDate()` | agent | open |

## Open questions / Assumptions

### Resolved
- **Follow-up (post-#44):** the `SetAvailabilityLookup` port was later relocated from `venue.api`
  to a dedicated `venue.spi` driven-port named interface, and the api-vs-spi rule was codified into
  the workflow — see `docs/plans/spi-named-interface-convention.md`. References below to
  "`venue.api`" for this port are historical.
- **Seam (user-deferred → agent-decided):** dependency inversion — `SetAvailabilityLookup` in
  `venue.api`, implemented by `availability`; endpoint stays in `venue`. Chosen over (a)
  relocating the read into `availability` (moves the public `/api/venues` endpoint, lower
  locality) and (b) flipping the pool-check out of `availability` (touches the #2/#3 module and
  U2/U3 tests). — *Owner:* agent · *Resolves by:* this plan.
- **Default date (user-decided):** tomorrow in `Europe/Tirane`, owned by the map and passed to
  the dialog; server cutoff stays authoritative. — *Owner:* user.
- **Drop the placeholder (agent-decided):** `seed_availability` is dropped via `V6` (AC intent:
  "dropping the placeholder"; invariant #12). The dormant-column alternative was rejected as it
  leaves dead data. — *Owner:* agent.

## Availability & concurrency (invariant #2)

- **Write paths to `set_availability` in scope:** **none** — this slice is read-only. The sole
  writer remains `availability`'s `claim` (U2). No double-booking surface is added.
- **Read path:** `SetAvailabilityLookup.takenOn(Collection<SetId>, LocalDate)` →
  `SELECT set_id FROM set_availability WHERE booking_date = :date AND set_id IN (:ids)`. Any
  existing row (`BOOKED_ONLINE`/`STAFF_MARKED`) ⇒ `TAKEN`; absence ⇒ `FREE` (matches the U2
  "row-existence is the hold" model exactly).
- **Source of truth preserved:** the map now reflects `set_availability`, so a display can never
  contradict the claim. The map is advisory only — the booking path still claims atomically and
  a contested `(set, date)` still returns `409 SET_TAKEN` (U3). This slice closes the
  *display-freshness* gap; it does not change the correctness guarantee.
- **Cutoff (invariant #4):** the read default (tomorrow) is independent of the booking cutoff;
  booking still enforces the evening-before cutoff server-side (U3, unchanged).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Why |
|---|---|---|---|
| M-1 | `venue` | existing | owns map assembly; declares the `SetAvailabilityLookup` port (in `api/`) and consumes it from `JdbcVenueCatalog`; `findVenueMap` gains a `LocalDate` |
| M-2 | `availability` | existing | implements `SetAvailabilityLookup` (its data, its table); existing `availability → venue::api` dep is reused |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers / Implementors |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetAvailabilityLookup#takenOn(Collection<SetId>, LocalDate)` | `SetId` (existing) | **consumed by** `venue` (its own map read); **implemented by** `availability` (legal `availability → venue::api`) |

This is a deliberate **dependency-inverted** port: it lives in the consumer's `api/` so the
provider (`availability`, which may only import `venue::api`) can implement it without a cycle.
Documented on the interface. No new `allowedDependencies` entry is required (`availability`
already lists `venue::api`).

**Domain events:** N/A — a synchronous query (the map needs the answer now to render). No state
changes, so no event.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves; read-only display change.

## Angular — frontend surfaces touched

- **`venue.service.ts`** — `getVenueMap(id, date)` appends `?date=` (URL-encoded `LocalDate`).
- **`venue-map.ts` / `.html`** — a `selectedDate` signal (default = tomorrow Europe/Tirane via a
  pure, testable `defaultBookingDate(now)` util); an accessible `<input type="date">`
  (labelled); re-fetch on change; pass `[date]="selectedDate()"` to `<app-booking-dialog>`. The
  "free today" summary copy becomes date-aware ("free on <date>"). Tile colour stays
  non-colour-only (existing accessible names).
- **`booking-dialog.ts`** — add `date = input.required<string>()`; seed the form's `date` field
  from it (drop the component's own `defaultDate()`), keeping the field editable; server stays
  authoritative.
- A11y: the date input has a visible `<label>`; AXE/contrast specs extended to the new control.

## FE↔BE contract

- **Request:** `GET /api/venues/{id}?date=YYYY-MM-DD` (param optional; omitted ⇒ server uses
  tomorrow Europe/Tirane). `date` is an ISO `LocalDate`.
- **Response:** unchanged `VenueMapView` shape; each `SetView.availability` now reflects
  `set_availability` for the effective date. No new fields → `venue.model.ts` unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V6 migration (drop seed_availability) | ✅ | (this slice) |
| 1 — `SetAvailabilityLookup` port + availability adapter | ✅ | (this slice) |
| 2 — date-aware `findVenueMap` + controller date param/default | ✅ | (this slice) |
| 3 — frontend date control + dialog date sync | ✅ | (this slice) |
| 4 — full-suite verify + review gate | ✅ | review gate run; minor findings fixed; pushed |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

## Review gate outcome (SDD)

Ran `riviera-review-overlay` + `/code-review origin/main...HEAD` (high effort, 8 finder angles
→ verify). **No Blocker/Major findings; zero correctness bugs.** Gates verified PASS: RV-BE-1
availability single-source-of-truth (read-only, no new write path, invariant #2), invariant #1
(JDBC-only, records, package-private adapter, `Optional`/`Set` from ports), invariant #11 (the
dependency-inverted `SetAvailabilityLookup` keeps `verify()` acyclic — `venue` never imports
`availability`; no `allowedDependencies` change needed), invariants #5/#6/#12, RV-FE-1 (Angular
v22 idioms + a11y), RV-CT-2 (wire shape), RV-PROC-1 (Skills consulted matches the diff).

Resolved minor findings (re-entered the loop at Implement; CI re-gated green; surface re-walked):
- **a11y (RV-FE-5):** `aria-live="polite"` on the availability summary so a date change is
  announced to screen-reader users.
- **Stale availability (RV-FE-2):** guard the map fetch so an out-of-order response from a
  rapid date switch can't overwrite the current one.
- **Cleanup:** extracted a shared `parseIsoDate()` (was duplicated in `dateLabel`/`addOneDay`);
  imported `Collectors` instead of an inline FQN.
- **Docs:** V6 comment (column created in V2, seeded in V3) and the plan's SQL (`IN (:ids)`)
  corrected.

Noted, not fixed (deliberate / out of scope): the booking dialog seeds its date once via
`ngOnInit` (the map closes the dialog on a date change, so the one-shot seed can't go stale);
the 2N `SetId` allocation in map assembly is negligible and the `SetRow` intermediate is
defensible; the `defaultsToTomorrowTirane` IT recomputes "tomorrow" independently of the bean
clock — a theoretical midnight-boundary flake only.

> Build note: phases were implemented and verified as one cohesive slice. Honest red→green
> signal: the full backend suite first failed on `ConcurrentClaimIT` (`[ALREADY_TAKEN,
> ALREADY_TAKEN]`) — the new ITs and the U2 concurrency test share the cached Spring context +
> Testcontainers DB, and my August/September dates collided with reserved ones. Moving the new
> tests to the unused November range (the repo's "distinct date per test" convention) fixed it;
> `WebCorsConfigTest` also needed a `Clock` bean once the controller began computing the default
> date. Both green afterwards.

---

## Phase plan (TDD per phase)

- **Phase 0 — V6 migration.** Write/adjust `VenueSeedMigrationIT` (no `seed_availability`
  column; 24 sets still load) → red → add `V6__drop_seed_availability.sql` → green.
- **Phase 1 — lookup seam.** New `AvailabilityLookupIT` (insert a row, assert `takenOn` returns
  that set id for the date and empty for another) → red → add `venue.api.SetAvailabilityLookup`
  + `availability` JDBC adapter → green. `ModularityTests` stays green.
- **Phase 2 — date-aware read.** Extend `VenueReadControllerIT` (AC-1/2/3) → red → make
  `VenueCatalog.findVenueMap(VenueId, LocalDate)`, overlay in `JdbcVenueCatalog`, add the
  `?date=` param + tomorrow-Tirane default in `VenueReadController`; fix the two `VenueCatalog`
  stubs → green.
- **Phase 3 — frontend.** Update `venue-map.spec.ts` / `booking-dialog.spec.ts` for the date
  control + dialog date input (AC-4) → red → implement → green; extend a11y/contrast specs.
- **Phase 4 — verify + review.** Full backend + frontend suites green; run the SDD review gate
  (`riviera-review-overlay` + `/code-review`) on the diff; resolve findings through the loop.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] **No JPA** (invariant #1); persistence is `JdbcClient` + SQL.
- [ ] **Availability** section honoured: read-only, sources from `set_availability`, no new
  write path (invariant #2); cutoff unchanged (#4).
- [ ] **Modulith** section honoured: no `venue → availability` import; the inverted port is in
  `venue.api`; `ModularityTests` green (invariant #11).
- [ ] Timezone: default date is tomorrow in `Europe/Tirane`; `booking_date` is a `LocalDate`
  (invariant #6).
- [ ] Flyway `V6` present; demo still loads (invariant #12).
- [ ] Frontend: a11y for the date control (label, AXE, contrast); no colour-only state; no
  `new Date()` in templates.
- [ ] Execution-status table matches reality; Open Questions resolved/deferred.
