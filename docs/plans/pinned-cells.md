# Pinned cells before the click — the owner's beach-map read with per-set lock facts, lock icons on both editor surfaces Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Before an operator paints, the layout editor already knows which sets a live claim pins:
an owner-asserted beach-map read carries, per locked set, the nearest live-booking date and the
nearest hold date; the canvas shows those cells with a lock and an accessible reason; the tier and
pool brushes still repaint them, the gap brush and a gap drag-sweep leave them unchanged and say
why, and the set editor disables Move and Remove on them with the same reason before any request.

**Architecture:** The lock the canvas shows must be the lock the server enforces, so the one
predicate — "a hold dated today or later in `Europe/Tirane`, or a booking that can still be
honoured" — moves out of `BeachMapEditService` into a named application holder, `LiveClaims`,
that both the write guards and the new read call (ADR-0018: a rule with two callers that must
agree earns the extraction). The read is a **new owner-asserted `GET /api/venues/{venueId}/beach-map`**
— the operator's map read the epic names, today absent: the editor seeds from the public tourist map,
which can never carry hold or booking facts (RESPONSIBILITIES § `venue`: hold type never reaches
the public surface). It answers `{ map: VenueMapView, locks: SetLock[] }`, the map composed by
`VenueCatalog#findVenueMap` exactly as the editor reads it today, the sparse `locks` list from the
existing SPI ports `SetAvailabilityLookup` and `BookingPresence`, each gaining one batch
nearest-date method (a method on an existing port, not a new port). No module boundary, grant or
event changes.

**Persistence:** JDBC only (invariant #1). No schema change, no migration. Two new read-only
statements: a `MIN(booking_date) … GROUP BY set_id` over `set_availability` (rides
`set_availability_uniq (set_id, booking_date)`) and a `MIN(booking_date) … GROUP BY set_id` over
`booking` filtered on the live statuses (rides `booking_set_date_idx (set_id, booking_date)`).
Neither names `set_position`, so `RetiredSetExclusionArchitectureTests` has nothing new to hold;
the set ids they receive come from the retired-excluding map read.

**Source of intent:** GitHub issue #1031 (parent epic #1027, revision 3 — user stories 17–18).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced seven things
the ticket did not say: (1) **there is no operator map read to extend** — the editor seeds from the
public `GET /api/venues/{id}`, so the pin facts need a new owner-asserted read, gated `OPERATOR`
above the public `GET /api/venues/**` like the daily read; (2) **the canvas has no drag-move
gesture** — its drag is drag-paint, and moving a set is the set editor's arm-then-click Move, so
"a drag-move is refused" is read as *a gap-brush drag-sweep, row fill or column fill crossing a
locked cell leaves it unchanged*, and the set editor's Move/Remove are disabled; (3) the nearest
date is answerable by neither SPI port today (both answer booleans or a single date) — one batch
method joins each existing port, which is what "reuse the existing ports, add no new port" allows;
(4) the lock predicate would otherwise be written twice — `LiveClaims` holds it for the guard and
the read; (5) `SetWriteErrorCode`'s TSDoc says "no console read predicts it, and a pre-warn probe
is a standing non-goal" — false after this slice, rewritten; (6) the editor's move off
`VenueService` shrinks `riviera-frontend`'s frozen cross-feature table by one file; (7) zero open
PRs, no Flyway number in play; the previous sibling #1030 closed out on the epic with PR #1043 and
its plan doc retires in this PR's close-out) · `riviera-plan-doc` (this template — forced a seam per
AC, the module-ownership table for a read that `venue` composes from two other modules' facts, and
the parity ledger for the editor's read switch) · `tdd` (each phase red first at the named seam: the
service fake, the adapter ITs, the controller IT, the Vitest specs, the mocked e2e) ·
`riviera-review-overlay` (review gate — **ran** on PR #1046 over `dbb76da7..6c5ddb90`: `code-review:code-review` at high effort, five generic reviewers plus a sixth walking the overlay banks; three findings, F-2/F-3/F-4, all fixed in the same round; RV-BE-1/9/11/12/19, RV-FE-8/9, RV-STYLE-1, RV-PROC-1 clear) · `riviera-docs-freshness` (**ran** over `dbb76da7..HEAD` as the pre-merge smoke: the rename grep on `hasLiveHold`/`isLivelyClaimed` and `getVenueMap` found only the sentences the diff already rewrote (RESPONSIBILITIES § venue, the frontend skill's frozen-edge table, the SPI inventory Javadoc, `JdbcBookingPresenceIT`'s "four probes"); the counting sweep over probe/spi/owner-read vocabulary found no stale "the two/three"; zero further findings; `docs/plans/retire-set-marker.md` retired, no citation of its slug outside `docs/plans/`) · `grilling`
(the intake questions answered from the code; the two product-flavoured calls — the reason copy and
keeping the tourist visibility fence on the owner's read — are recorded as resolved assumptions
below) · `riviera-local-debug` (clone unshallowed; system Gradle on the JDK 21 daemon compiling on
the JDK 25 toolchain; scoped `--tests`; the structural net after the holder extraction and the
port change; dockerd present so single IT classes run locally; the mocked e2e via
`PW_CHROMIUM_EXECUTABLE`) · `riviera-modulith` (the read's driving port stays in `application/`,
its view records too — REST-only consumers, invariant #11, the `SetDayState` precedent; the SPI
inventory Javadoc in `venue/spi/package-info.java` updated for the two methods; `VenueCatalog` is
`venue`'s own port so the read service may compose from it) · `riviera-java-conventions` (records
for `SetLock`/`OperatorBeachMap`/`SetLockView`, nullable dates documented rather than `Optional`
fields, `Map` answers keyed by typed id, constructor injection, package-private service and
holder, `Comparator` ordering by set id, one-line inline comments) · `codebase-design` (the
`LiveClaims` seam: a deep holder with three methods that both callers cross; rejected a second
"lock read" port beside `ViewDailyAvailability` in favour of one new driving port `ViewBeachMap`
because the two reads are different conversations — one dated, one not) · `domain-modeling`
(`CONTEXT.md` gains **Locked set**; challenged "pinned" vs "locked" — the glossary says locked,
the visual is a pin/lock icon) · `riviera-frontend` (the read moves to `OperatorConsoleService`
in `operator/`; the model types beside `SetDayState`; the glyph is a `shared/` component; the
frozen-edge table shrinks in the same PR) · `angular-developer` + angular-cli MCP
(`get_best_practices` for the v22 posture; `search_documentation` v22 verified: `computed()` for
the derived lock maps, `[aria-label]`/`[attr.aria-describedby]` bindings, `@if`/`@for` control
flow, `input()` for the set editor's new `locks` input; `linkedSignal`/`resource` checked and not
needed — the editor's read is an explicit epoch-guarded subscription today and stays so) ·
`riviera-tailwind` (Tailwind v4 docs verified: `aria-disabled:` and `disabled:` variants for the
disabled Move/Remove, `[&_svg]:size-*` arbitrary variant for the glyph, `sr-only` for the hidden
reason text, `contents` host; the glyph follows ICON-1..6 on the `clock-icon.ts` contract; no
`@apply`, tokens only, no new colour) · `playwright-cli` (the mocked suite: one stateful mock per
editor e2e gains the `GET …/beach-map` route; the new flows ride `layout-editor.e2e.ts` and
`operator-set-editing.e2e.ts`).

**Branch:** `claude/riviera-locked-cell-behavior-7xs05q` — the session's designated remote
branch stands in for `feature/pinned-cells` (`riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue with three sets — one carrying a `CONFIRMED` booking dated 2027-07-01
  (with its `BOOKED_ONLINE` availability row), one carrying only a `STAFF_MARKED` row dated
  tomorrow, one free — when the owner reads `GET /api/venues/{venueId}/beach-map`, then the
  response carries `map.sets` for all three and `locks` for exactly the first two:
  `{setId, bookedOn: "2027-07-01", heldOn: "2027-07-01"}` and `{setId, bookedOn: null,
  heldOn: <tomorrow>}`, ordered by set id. *Seam:* the HTTP route · *Pinned by:*
  `VenueAdminControllerIT.beachMapReadCarriesALockPerClaimedSetAndNothingForAFreeSet`
- [x] **AC-2:** Given a set whose only hold is dated yesterday and whose only booking is
  `CANCELLED`, when the owner reads the beach map, then `locks` is empty — the read's lock is the
  write guard's lock. *Seam:* the HTTP route · *Pinned by:*
  `VenueAdminControllerIT.beachMapReadIgnoresPastHoldsAndFinishedBookings`
- [x] **AC-3:** Given a non-owner operator, when they read another venue's beach map, then the
  answer is `403 NOT_VENUE_OWNER` before any existence probe; unauthenticated is `401`. *Seam:* the
  HTTP route · *Pinned by:* `CrossVenueDenialIT.beachMapReadByNonOwnerIs403`,
  `VenueAdminControllerIT.beachMapReadRequiresOperator`
- [x] **AC-4:** Given `LiveClaims` over fakes with a hold on set 1 dated today, a hold on set 2
  dated yesterday and a live booking on set 3, when `locksOn([1,2,3])` is asked, then sets 1 and 3
  are locked with their dates and set 2 is absent; and `isLivelyClaimed` agrees per set. *Seam:*
  `LiveClaims` (the application holder) · *Pinned by:* `LiveClaimsTest`
- [x] **AC-5:** Given the owner's read service, when a non-owner asks, then `NotVenueOwnerException`
  is thrown with no catalogue or claim probe; when the venue vanished, the answer is empty; when it
  exists, the locks are the holder's answer for the map's set ids. *Seam:* `ViewBeachMap` ·
  *Pinned by:* `BeachMapReadServiceTest`
- [x] **AC-6:** Given set 1 held on 2027-06-20 and 2027-06-18, set 2 held only on 2027-06-10, when
  `nearestClaimsFrom([1,2], 2027-06-15)` is asked, then `{1 → 2027-06-18}`; an empty input answers
  an empty map without a query. *Seam:* `SetAvailabilityLookup` (SPI) · *Pinned by:*
  `AvailabilityLookupIT.nearestClaimsFromAnswersTheEarliestHoldOnOrAfterTheCutoffPerSet`
- [x] **AC-7:** Given set 1 with a `CANCELLED` booking on 2027-06-10 and a `CONFIRMED` one on
  2027-06-22, set 2 with only a `COMPLETED` booking, when `nearestLiveBookings([1,2])` is asked,
  then `{1 → 2027-06-22}`. *Seam:* `BookingPresence` (SPI) · *Pinned by:*
  `JdbcBookingPresenceIT.nearestLiveBookingsAnswersTheEarliestHonourableDatePerSet`
- [x] **AC-8:** Given the layout editor loaded with a locked set at row A position 2 (booked
  2026-09-12), when the tier brush paints it, then its `data-state` changes and the dirty count is
  1; when the gap brush then clicks it, `data-state` and the dirty count are unchanged and the lock
  notice reads "Row A · position 2 is booked Sat 12 Sept 2026 — it can’t become a gap. Its tier and
  pool can still change." (`formatCivilDate`'s en-IE label, the console's one date format) *Seam:* the rendered component (`[data-testid=layout-cell]`, the save bar) ·
  *Pinned by:* `layout-editor.spec.ts` "locked cells"
- [x] **AC-9:** Given a gap-brush drag-sweep across a row holding one locked cell, and a gap
  fill of that row, when each completes, then every unlocked cell is a gap, the locked cell keeps
  its state, and the dirty count counts only the unlocked cells. *Seam:* the rendered component ·
  *Pinned by:* `layout-editor.spec.ts` "locked cells"
- [x] **AC-10:** Given a locked cell, when the a11y spec inspects its button, then it carries a
  lock glyph, `aria-describedby` resolves to the reason text, and axe finds no violation on the
  locked grid. *Seam:* the rendered component · *Pinned by:* `layout-editor.a11y.spec.ts`
- [x] **AC-11:** Given the set editor with a locked set selected, when the inspector renders, then
  Move and Remove are `disabled` with a visible reason naming the date, the price, tier and pool
  controls are enabled, the cell's description carries the reason, and axe finds no violation.
  *Seam:* the rendered component (`set-move`, `set-remove`, `set-locked-reason`) · *Pinned by:*
  `set-editor.spec.ts` "locked set", `set-editor.a11y.spec.ts`
- [x] **AC-12:** Given the console themes, when the contrast specs run, then the lock glyph's ink
  meets 3:1 over every cell fill and the lock reason's ink meets 4.5:1 on its surface. *Seam:* the
  token mirrors (`src/testing/*`) · *Pinned by:* `layout-editor.contrast.spec.ts`,
  `set-editor.contrast.spec.ts`
- [x] **AC-13:** Given the mocked editor with a locked seeded set, when the operator repaints its
  tier and then tries to gap it in a real browser, then the tier paint lands and the gap is refused
  with the reason; on the per-set surface Move and Remove are disabled with the reason. *Seam:*
  the browser (`test:e2e:a11y`) · *Pinned by:* `layout-editor.e2e.ts` "a locked cell repaints but
  never gaps", `operator-set-editing.e2e.ts` "a locked set disables Move and Remove before any
  request"
- [x] **AC-14:** `RESPONSIBILITIES.md` § `venue` carries the owner's beach-map read bullet and the
  layout-write paragraph names the shared predicate; `CONTEXT.md` defines **Locked set**.
  *Seam:* the docs · *Pinned by:* review (RV-PROC-1) + `riviera-docs-freshness`

## Non-goals

- Making the bulk save a diff, or naming the blocking sets in a refused save (#1032).
- Regenerate over a locked layout: the server still refuses it venue-wide (`LAYOUT_IN_USE`) until
  #1032; the editor does not fence Generate.
- Lifting the tourist visibility fence off the owner's read (parity with the editor's read today).
- A per-cell visible reason on the bulk canvas beyond the `title`, the refusal notice and the rail
  legend — tile size forbids text.
- Any change to the preview/commit flow, moves or refunds (#1033+).

## Behavior-parity ledger

The editor's seed read moves from the public `GET /api/venues/{id}?date=` to the owner's
`GET /api/venues/{venueId}/beach-map`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Seeds the grid, prices, row names and `setVersion` from `VenueMapView` | preserved | `OperatorBeachMap.map` is the same `VenueMapView`, composed by the same `findVenueMap` |
| Hidden venue (owner not `ACTIVE`) → 404 → "Couldn’t load this venue’s beach map" | preserved | the read composes through `VenueCatalog#findVenueMap`, which keeps the fence; 404 `NO_SUCH_VENUE` maps to the same `loadFailed` state |
| 401 on the read → `operator.sessionLost()` | preserved | same error branch |
| Epoch-guarded venue switch on load, re-read after a per-set write, reload after `STALE_WRITE` | preserved | all three paths call the one new `beachMap()` and seed `locks` beside the sets |
| Passes today's date for the availability overlay | changed | the server uses its own Tirane today; the editor never read `availability` |
| Resets `ConsoleVenueMap` after writes | preserved | untouched |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The canvas lock and the server's `SET_IN_USE` disagree (a set shown free is refused, or shown locked is allowed) | med | high | one predicate, `LiveClaims`, called by both; `LiveClaimsTest` + AC-2 pin the shared cutoff; the SPI methods mirror `anyClaimsFrom`'s `>= from` and `hasLiveBookings`' `LIVE_STATUSES` | agent | closed — `dd7c3a89` (`LiveClaims`), `3385b40b` (AC-2 IT) |
| R-2 | Hold/booking facts leak to tourists (BOLA / public surface) | low | high | the read is owner-asserted first (403 before existence) and gated `OPERATOR` in `SecurityConfig` above the public GET; AC-3 | agent | closed — `3385b40b` (`CrossVenueDenialIT`, `EndpointRoleGateCoverageTest`) |
| R-3 | A lock read failure leaves the editor painting gaps the server refuses | low | med | the locks ride the same response as the map: no map without locks; the load-failed state already exists | agent | closed — `c47f564e` (one read, `{ map, locks }`) |
| R-4 | Every editor spec and mock serves the old map URL/shape | high | med | the spec helpers' predicate `includes('/api/venues/1')` matches the new URL; fixtures gain the `{ map, locks }` wrap by one sed; the three e2e mock helpers (`mockEditor`, `mockConsole`, `mockWholeConsole`) gain the GET route — the PUT-only `beach-map` routes must `fallback()` on GET | agent | closed — `c47f564e`, `6c5ddb90`; three multi-line fixtures the sed missed surfaced as CI's two unhandled `setVersion` errors (F-1) |
| R-5 | Timezone: the read's "today" drifts from the guard's | low | high | both take `LiveClaims.today()` — `LocalDate.now(clock.withZone(Europe/Tirane))`; `LiveClaimsTest` uses the `VenueAdminServiceTest` late-UTC clock that fails a UTC-vs-Tirane bug | agent | closed — `dd7c3a89` (`LiveClaimsTest.todayIsTheTiraneDate`) |
| R-6 | The disabled Move/Remove strand focus (RV-FE-9) | low | med | a validity-disabled control keeps `[disabled]`; it is disabled before the operator can focus it (state, not a transition) | agent | closed — `c47f564e`; `check-focus-posture.mjs` clean over the range |
| R-7 | Error-contract drift on the new endpoint | low | low | `ApiProblem` only: `404 NO_SUCH_VENUE` with the controller's existing detail; 403/401 from the handler | agent | closed — `3385b40b` |

## Open questions / Assumptions

### Resolved

- **Assumption — "held by staff" copy.** A hold from today on with no live booking on the set is a
  staff walk-in mark: a `BOOKED_ONLINE` row exists only while its booking is live, so a live hold
  without a live booking can only be `STAFF_MARKED`. The reason therefore reads "booked {date}"
  when a live booking exists, else "held by staff {date}"; both dates ride the wire. *Resolved
  from the availability model (`RESPONSIBILITIES.md` § `availability`).*
- **Assumption — the owner's read keeps the tourist visibility fence.** The editor reads the fenced
  public map today, so a hidden-but-owned venue already fails to load; the parity ledger keeps
  that. Lifting it is a separate decision. *Resolved: parity.*
- **Assumption — "drag-move" is the gap-brush drag-sweep.** No canvas drag-move exists; the set
  editor's Move is a button. *Resolved at intake, recorded in Skills consulted (2).*

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none in scope — the slice is read-only.
- **Uniqueness guarantee:** unchanged (`set_availability_uniq`).
- **Concurrency strategy:** the read is a snapshot, never a hold: a set free at read time may be
  claimed before the save; the write guards under `SELECT … FOR UPDATE` remain the only decision.
  The canvas lock is advisory copy for the operator, and the server's `SET_IN_USE`/`LAYOUT_IN_USE`
  still answer a stale draft.
- **Pool rule (invariant #3):** untouched; a locked set's pool stays editable (revision 3).
- **Cutoff rule (invariant #4):** the hold cutoff is "today or later in `Europe/Tirane`", the same
  window the write guards use; sales close plays no role.
- **Pinning test:** N/A — no reservation path changes; the existing `SetWriteVsClaimConcurrencyIT`
  still pins the guard.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | none (read) | the beach map and the layout-write guards are its Job; the read composes its map with facts it asks through its own `spi` |
| M-2 | `availability` | existing | none (read) | sole owner of `set_availability`; answers the nearest hold date through `venue::spi` |
| M-3 | `booking` | existing | none (read) | sole owner of `booking`; which statuses are live is its call, answered through `venue::spi` |

**Cross-module named interfaces**

| # | Module.spi | Port method (new) | Public types | Implementor |
|---|---|---|---|---|
| NI-1 | `venue.spi` | `SetAvailabilityLookup#nearestClaimsFrom(Collection<SetId>, LocalDate) → Map<SetId, LocalDate>` | `SetId` | `availability` (`JdbcSetAvailabilityLookup`) |
| NI-2 | `venue.spi` | `BookingPresence#nearestLiveBookings(Collection<SetId>) → Map<SetId, LocalDate>` | `SetId` | `booking` (`JdbcBookingPresence`) |

No grant changes: both implementors already list `venue::spi`.

**Domain events:** none.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| the lock predicate (hold from today, or a live booking) and its Tirane cutoff | `venue` | `venue` Job: the layout-write guards; it already owns `hasLiveHold`/`isLivelyClaimed`; **not** `availability` (Not-My-Job: knowing what a hold means for a layout) |
| which booking statuses are live | `booking` | unchanged — `BookingPresence` Javadoc: "`venue` must never enumerate booking statuses" |
| the nearest hold date per set | `availability` | sole reader of `set_availability` |
| the owner's beach-map read (403-first, map + locks) | `venue` | the operator console read model beside the daily read; `operator` decides ownership, `venue` renders |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` + `.html` | existing | standalone component | new `locks` signal, `lockByCoord`/`lockedCount` computed, `lockNotice` signal | none |
| FE-2 | `operator/set-editor.ts` + `.html` | existing | standalone component | new `locks` `input()`, `selectedLock` computed | Signal Forms unchanged |
| FE-3 | `shared/lock-icon.ts` | new | glyph component (ICON-1..6) | none | none |
| FE-4 | `operator/operator-console.model.ts` / `.service.ts` | existing | model + `@Service` | `beachMap(venueId)` observable | none |
| FE-5 | `operator/lock-reason.ts` | new | pure functions `lockReason`/`lockDescription` — the one home of the copy | none | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()` signal APIs, `computed()`
for derived state. No deviation.

## FE↔BE contract

- **New endpoint:** `GET /api/venues/{venueId}/beach-map` (session, role `OPERATOR`, owner-asserted)
  → `200 { map: VenueMapView, locks: [{ setId: number, bookedOn: "YYYY-MM-DD" | null, heldOn:
  "YYYY-MM-DD" | null }] }`, `locks` sparse and ordered by set id; `403 NOT_VENUE_OWNER`;
  `404 NO_SUCH_VENUE`; `401`.
- **Client typing:** hand-written `OperatorBeachMap` / `SetLock` in `operator-console.model.ts`,
  consumed by `OperatorConsoleService.beachMap`; never `as any`.
- **Dates on the wire:** ISO `LocalDate` strings rendered by the adapter view (`SetLockView`), the
  `DailyAvailabilityView` precedent.

## Execution status

**Stage pointer:** `DONE — merged via PR #1046`

**Next action:** none for this slice; the merge close-out (issue closed, epic #1027 ticked with the PR number, subscription ended) is GitHub-side.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `LiveClaims` holder + the two SPI nearest-date methods | ✅ | `dd7c3a89` |
| 1 — `ViewBeachMap` read: service, controller, security gate, ITs | ✅ | `3385b40b` |
| 2 — Frontend model/service + editor read switch + lock glyph | ✅ | `c47f564e` (carries the phase 3/4 code too: the set editor's `locks` input is what lets the editor template compile) |
| 3 — Canvas lock behaviour (brushes, sweep, fills, notice) + specs | ✅ | `e5e5d9b5` |
| 4 — Set editor Move/Remove lock + specs | ✅ | `e5e5d9b5` |
| 5 — Mocked e2e + docs (RESPONSIBILITIES, CONTEXT, frontend skill table) | ✅ | `6c5ddb90`; CI fix + close-out prep `99b73573`; review fixes `9691c749` + the close-out commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-2 | review (reviewer #5, code-comment guidance) | `SetLock`'s Javadoc and the frontend `SetLock` TSDoc said "never both", which reads as never both set while a booked set routinely carries both dates; the controller's class Javadoc listed two of its six ports | fixed in `5eb07590` — wording is now "never both null", the port list is complete |
| F-3 | review (reviewers #1 and #6, RV-FE-10, Major) | the lock-notice `<output>` live region was rendered inside the `@if`, so it entered the DOM already holding its text — silent on most screen readers, and the refusal's only signal | fixed in the close-out commit — the region is always mounted, only its content branches; `layout-editor.a11y.spec.ts` now pins the empty region before the refusal and the text after |
| F-4 | review (reviewer #6, RV-PROC-2 §c, Major) | `console-venue-map.ts`'s TSDoc still counted `LayoutEditor` among the direct `getVenueMap` callers ("four of the seven"), and `pricing-tab.ts`'s said the editor reads the public map | fixed in the close-out commit — both TSDocs state the tree as it now stands (five callers: four snapshot, two direct) |
| F-1 | CI (frontend job, first push) | three multi-line `layout-editor.spec.ts` fixtures still flushed the flat map to the owner's read → two unhandled `Cannot read properties of undefined (reading 'setVersion')` errors, green locally because Vitest's summary line hid them | fixed in the close-out commit (fixtures wrapped `{ map, locks }`; re-run shows no Errors line) |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/application/LiveClaims.java` — the shared lock predicate holder (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/SetLock.java` — one locked set's facts (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/OperatorBeachMap.java` — map + locks (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/ViewBeachMap.java` — the owner's read port (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapReadService.java` — its service (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapEditService.java` — delegates the claim questions to `LiveClaims`
- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — `nearestClaimsFrom`
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — `nearestLiveBookings`
- `platform/src/main/java/ai/riviera/platform/venue/spi/package-info.java` — inventory Javadoc
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — the grouped MIN read
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — the grouped MIN read over live statuses
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — `GET /{venueId}/beach-map`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/OperatorBeachMapView.java` — wire shape (new)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetLockView.java` — wire shape with ISO dates (new)
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — `GET` beach-map gated `OPERATOR`
- `platform/src/test/java/ai/riviera/platform/venue/application/LiveClaimsTest.java` (new)
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the inert `ViewBeachMap` bean the web slices need
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapReadServiceTest.java` (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — constructor + fakes gain the new methods
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java` — `nearestClaimsFrom`
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — `nearestLiveBookings`
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — the read's ITs
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — the 403
- `frontend/src/app/operator/operator-console.model.ts` — `SetLock`, `OperatorBeachMap`; `SetWriteErrorCode` TSDoc
- `frontend/src/app/operator/operator-console.service.ts` — `beachMap(venueId)`
- `frontend/src/app/operator/operator-console.service.spec.ts` — the read
- `frontend/src/app/shared/lock-icon.ts` — the glyph (new)
- `frontend/src/app/shared/lock-icon.spec.ts` (new)
- `frontend/src/app/operator/lock-reason.ts` — the reason copy; `operator/`, not `shared/`, because it reads the operator model (new)
- `frontend/src/app/operator/lock-reason.spec.ts` (new)
- `frontend/src/app/operator/layout-editor.ts` / `.html` — read switch, locks, refusals, glyph, legend, notice
- `frontend/src/app/operator/console-venue-map.ts` — TSDoc: the editor no longer calls `getVenueMap` (review F-4)
- `frontend/src/app/operator/pricing-tab.ts` — TSDoc: reads the shared snapshot, not "like the editor" (review F-4)
- `frontend/src/app/operator/layout-editor.spec.ts` — the locked-cells describe
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — the description + axe proof
- `frontend/src/app/operator/layout-editor.contrast.spec.ts` — the glyph and notice inks
- `frontend/src/app/operator/console-venue-switch.spec.ts` — the read's new URL/shape
- `frontend/src/app/operator/set-editor.ts` / `.html` — `locks` input, disabled Move/Remove, reason, glyph
- `frontend/src/app/operator/set-editor.spec.ts` — the locked-set describe
- `frontend/src/app/operator/set-editor.a11y.spec.ts` — the description + axe proof
- `frontend/src/app/operator/set-editor.contrast.spec.ts` — the reason ink
- `frontend/e2e/layout-editor.e2e.ts` — GET route + the locked-cell flow
- `frontend/e2e/operator-set-editing.e2e.ts` — GET route + the locked-set flow
- `frontend/e2e/support/operator-console.mocks.ts` — GET route
- `RESPONSIBILITIES.md` — § `venue` read bullet + layout-write paragraph
- `CONTEXT.md` — **Locked set**
- `.claude/skills/riviera-frontend/SKILL.md` — the frozen-edge table row shrinks
- `docs/plans/pinned-cells.md` — this plan
- `docs/plans/retire-set-marker.md` — retired at close-out (merged via PR #1043)

---

## Phase 0 — `LiveClaims` holder + the two SPI nearest-date methods

**Files:** Create `LiveClaims.java`, `SetLock.java`, `LiveClaimsTest.java`, `BookingPresenceIT.java` ·
Modify `BeachMapEditService.java`, `SetAvailabilityLookup.java`, `BookingPresence.java`,
`JdbcSetAvailabilityLookup.java`, `JdbcBookingPresence.java`, `VenueAdminServiceTest.java`,
`AvailabilityLookupIT.java`, `spi/package-info.java`

- [x] **Step 1: Write the failing tests** — `LiveClaimsTest` (AC-4) over hand-written fakes with the
  late-UTC fixed clock; `AvailabilityLookupIT.nearestClaimsFrom…` (AC-6);
  `BookingPresenceIT.nearestLiveBookings…` (AC-7).

```java
@Test
void locksOnAnswersTheNearestHoldAndBookingPerSetAndSkipsFreeSets() {
	availability.holdOn.put(HELD, TODAY_IN_TIRANE);
	availability.holdOn.put(PAST, TODAY_IN_TIRANE.minusDays(1));
	bookings.liveOn.put(BOOKED, TODAY_IN_TIRANE.plusDays(3));

	Map<SetId, SetLock> locks = claims.locksOn(List.of(HELD, PAST, BOOKED, FREE));

	assertEquals(Map.of(
			HELD, new SetLock(HELD, null, TODAY_IN_TIRANE),
			BOOKED, new SetLock(BOOKED, TODAY_IN_TIRANE.plusDays(3), null)), locks);
	assertTrue(claims.isLivelyClaimed(HELD));
	assertFalse(claims.isLivelyClaimed(PAST));
	assertTrue(claims.isLivelyClaimed(BOOKED));
}
```

- [x] **Step 2: Run, verify red** — `gradle --no-daemon --console=plain test --tests "*LiveClaimsTest*"` → compile failure (no holder).
- [x] **Step 3: Minimal implementation** — `LiveClaims` (`@Component`, package-private): `today()`,
  `hasLiveHold(Collection<SetId>)`, `isLivelyClaimed(SetId)`, `locksOn(Collection<SetId>)`;
  `BeachMapEditService` takes `LiveClaims` instead of `SetAvailabilityLookup`; the two SPI methods
  + adapters + fakes.
- [x] **Step 4: Run, verify green** — the three classes + `VenueAdminServiceTest`, then the structural net.
- [x] **Step 5: Generalization audit** — population: every implementor of the two SPI ports
  (`grep -rln "implements SetAvailabilityLookup\|implements BookingPresence" platform/src`).
- [x] **Step 6: Commit** — `Extract the live-claim predicate and add the nearest-date SPI reads (#1031)`
- [x] **Step 7: Update execution status.**

## Phase 1 — `ViewBeachMap` read: service, controller, security gate, ITs

- [x] **Step 1: Failing tests** — `BeachMapReadServiceTest` (AC-5), `VenueAdminControllerIT` (AC-1,
  AC-2, `beachMapReadRequiresOperator`), `CrossVenueDenialIT.beachMapReadByNonOwnerIs403` (AC-3).
- [x] **Step 2: Run, verify red.**
- [x] **Step 3: Minimal implementation** — `SetLock`, `OperatorBeachMap`, `ViewBeachMap`,
  `BeachMapReadService` (ownership → `catalog.findVenueMap(venueId, claims.today())` →
  `claims.locksOn(setIds)` sorted by id), controller `GET /{venueId}/beach-map` →
  `OperatorBeachMapView`, `SecurityConfig` `GET BEACH_MAP_PATH` → `OPERATOR`.
- [x] **Step 4: Run, verify green** — the classes above + the structural net.
- [x] **Step 5: Generalization audit** — population: every owner-asserted `GET` under
  `/api/venues/*` that `SecurityConfig` gates above the public GET (`grep -n "hasRole(OPERATOR_ROLE)" SecurityConfig.java`), confirming the new route sits in that block.
- [x] **Step 6: Commit** — `Add the owner's beach-map read with per-set lock facts (#1031)`; open the draft PR.
- [x] **Step 7: Update execution status.**

## Phase 2 — Frontend model/service + editor read switch + lock glyph

- [x] **Step 1: Failing tests** — `operator-console.service.spec.ts` (`beachMap` GET URL + shape),
  `lock-icon.spec.ts` (aria-hidden host + svg, currentColor), `lock-reason.spec.ts` (the copy),
  `layout-editor.spec.ts` fixtures switched to `{ map, locks }` — red until the editor reads it.
- [x] **Step 2–4** — implement, green: `npm test -- layout-editor operator-console.service lock-`.
- [x] **Step 5: Generalization audit** — population: every spec/mock that serves the editor's map
  read (`grep -rln "api/venues/1\b\|api\\\\/venues\\\\/1(" frontend/src/app/operator frontend/e2e`).
- [x] **Step 6: Commit** — `Read the editor's map through the owner's beach-map read (#1031)`.

## Phase 3 — Canvas lock behaviour + specs

- [x] **Step 1: Failing tests** — `layout-editor.spec.ts` "locked cells" (AC-8, AC-9),
  `layout-editor.a11y.spec.ts` (AC-10), `layout-editor.contrast.spec.ts` (AC-12).
- [x] **Step 2–4** — `paintAt` refuses the gap brush on a locked coordinate with `lockNotice`;
  `fillRow`/`fillColumn` skip locked cells for the gap brush and report the kept count; the cell
  renders the glyph, `title` with the reason, `aria-describedby` to an `sr-only` reason span; the
  rail legend counts locked sets.
- [x] **Step 5: Generalization audit** — population: every writer of `grid` that can turn a cell
  into `'gap'` (`grep -n "grid.update\|grid.set" layout-editor.ts`).
- [x] **Step 6: Commit** — `Lock claimed cells on the paint canvas: repaint yes, gap no (#1031)`.

## Phase 4 — Set editor Move/Remove lock + specs

- [x] **Step 1: Failing tests** — `set-editor.spec.ts` "locked set" (AC-11), a11y + contrast.
- [x] **Step 2–4** — `locks` input, `selectedLock` computed, `[disabled]` on Move/Remove,
  `set-locked-reason` paragraph, cell glyph + description.
- [x] **Step 6: Commit** — `Disable Move and Remove on a locked set before any request (#1031)`.

## Phase 5 — Mocked e2e + docs

- [x] **Step 1: Failing e2e** — the two flows (AC-13); run
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts layout-editor operator-set-editing`.
- [x] **Step 2–4** — the mock routes, the flows green; docs (AC-14); the frontend skill table;
  `SetWriteErrorCode` TSDoc; lint + format + full Vitest.
- [x] **Step 6: Commit** — `Pinned cells: mocked e2e, glossary and responsibilities (#1031)`; mark ready for review.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-09 | phase 0 — two methods added to the SPI ports | every class implementing either port (a new abstract method breaks each) | `grep -rln "implements SetAvailabilityLookup\|implements BookingPresence" platform/src` | `JdbcSetAvailabilityLookup`, `JdbcBookingPresence`, `VenueAdminServiceTest`'s two fakes; `LiveClaimsTest` adds two more | all implemented; Mockito mocks elsewhere need nothing |
| 2026-09-09 | phase 1 — a new operator-only `GET` under `/api/venues/*` | every owner-asserted `GET` the security chain gates above the public GET | `grep -n "hasRole(OPERATOR_ROLE)" platform/src/main/java/ai/riviera/platform/SecurityConfig.java` | profile, takings, daily availability, mine, defaults, staff bookings, payout ledger | the beach-map GET joins that block; `EndpointRoleGateCoverageTest` proves it is gated, `WebSliceStubs` supplies the port |
| 2026-09-09 | phase 2 — the editor's read moved to `/beach-map` | every spec or mock that serves the editor's map read | `grep -rln "api/venues/1" frontend/src/app/operator; grep -ln "layout-grid\|layout-cell\|set-cell\|/beach-map" frontend/e2e/*.e2e.ts frontend/e2e/support/*.ts` | `layout-editor.spec/a11y.spec`, `console-venue-switch.spec`; 12 e2e specs through three mock helpers (`mockEditor`, `mockConsole`, `mockWholeConsole`) | fixtures wrapped `{ map, locks }`; the three helpers gain the GET route; the PUT-only `beach-map` routes now `fallback()`/answer on GET |
| 2026-09-09 | phase 3 — the gap brush must skip a locked coordinate | every writer of `grid` that can turn a cell into `'gap'` | `grep -n "grid.update\|grid.set" frontend/src/app/operator/layout-editor.ts` | `paintCell`, `fillRow`, `fillColumn` (the brush writers); `generateNow`, `seedFrom`, `discard`, `reloadAfterStale`, `onSetsChanged` (whole-grid resets) | the three brush writers go through `paintOver`; the resets are out of scope (Regenerate stays server-refused until #1032) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1/2/3 (HTTP):** `gradle test --tests "*VenueAdminControllerIT*" --tests "*CrossVenueDenialIT*"` → 50 + 29 tests, 0 skipped, 0 failures. Verified at `3385b40b`.
- [x] **AC-4/5 (service):** `gradle test --tests "*LiveClaimsTest*" --tests "*BeachMapReadServiceTest*"` → 4 + 3 green. Verified at `dd7c3a89` / `3385b40b`.
- [x] **AC-6/7 (SPI):** `gradle test --tests "*AvailabilityLookupIT*" --tests "*JdbcBookingPresenceIT*"` → 15 + 5 green, Docker present. Verified at `dd7c3a89`.
- [x] **AC-8/9/10/11/12 (Vitest):** `ng test --watch=false` → 241 files, 2948 tests green, no unhandled errors after F-1. Verified at the close-out commit.
- [x] **AC-13 (browser):** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts` over the 12 editor-rendering specs → 117 green after the two set-editing overrides moved onto the mock. Verified at `6c5ddb90`.
- [x] **AC-14 (docs):** `RESPONSIBILITIES.md` § `venue` (read bullet + *One predicate, two callers*), `CONTEXT.md` **Locked set**. Verified at `6c5ddb90`.
- [x] **Structural net:** the six-class command green after phase 0 and phase 1 (`ModularityTests` 1, `JdbcOnly` 2, `PackageShape` 4, `DomainPurity` 5, `PublishedSurfacePlacement` 11, `RetiredSetExclusion` 4).

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
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #1046`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone (rung 1, `code-review:code-review`).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
