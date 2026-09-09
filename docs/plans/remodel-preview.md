# Remodel preview — an edge-orchestrated dry run classifying every affected claim into zones and five outcome groups Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Before a bulk save that removes or repositions sets, the operator sees — without anything
being written — every live claim the save would disturb, in five groups: the bookings that would
**move** (to which set, how far), be **refunded**, be **released or declined**, the **staff walk-in
holds**, and the claims that **block** the save, each block naming the set to keep in this save; a
diff that only repaints price, tier or pool, or removes sets nobody holds, answers an empty
classification and the editor saves without a dialog. The commit still refuses any affected claim.

**Architecture:** The dry run is a `POST /api/venues/{venueId}/beach-map/preview` at the
**platform edge** (root package), composing two published ports the root is deliberately granted:
`venue.api.BeachMapRemodel#preview` (owner-asserted; diffs the submitted cells against the active
map without locking or writing and answers the disturbed sets with their walk-in holds) and
`booking.api.RemodelClaims#classify` (owner-asserted; classifies every live booking on those sets
through two named rule holders — `RemodelZones` in `booking/application/remodel` with a `Clock` and
the two duration properties, and `MoveRanking` in `booking/domain`, pure). `venue` never depends on
`booking`; the edge assembles the five groups. The grant is a deliberate edit to
`CompositionRootDisciplineTests` recorded in ADR-0020.

**Persistence:** JDBC only (invariant #1). **No migration.** New read-only SQL: a non-locking
placements read of `active_set_position`, the venue's active sets with tier and pool, the free
online sets on a date (active map minus `set_availability` rows), the walk-in holds from a date
(`state = 'STAFF_MARKED'`), and the live bookings on a set list. Every new set read selects from
`active_set_position` (ADR-0019); the existing indexes (`booking_set_date_idx`,
`set_availability_uniq`, `set_position_venue_id_idx`) serve them; no new index.

**Source of intent:** GitHub issue #1033 (parent epic #1027, revision 3 — user stories 19 and 21).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced, all from
the code: (1) `CompositionRootDisciplineTests` allowlists what the root may import and neither
`venue` nor `booking` is on it, while the epic (rev. 2/3) and the ticket fix the orchestration home at
the edge — its own message says a new grant is a deliberate edit to the rule, so the grant is made
here and written down as ADR-0020, with the alternative shapes (a `booking`-hosted controller; a
`venue → booking` port, which cycles) recorded as rejected; (2) the PUT body carries no set ids and
the canvas has no drag-move (#1032 close-out), so "moved" reaches the save as removed + inserted, and a
kept cell whose position number changes is the per-set reposition's twin — the preview classifies
exactly `LayoutDiff#disturbed()`'s set, never a "moved set with identity"; (3) the staff-hold group is
an `availability` fact `venue` already reads through its SPI, while `booking` cannot read holds at all
(`availability::api` is the claim port only) — so `venue` answers the walk-in holds beside the disturbed
sets and `booking` answers the four booking groups; (4) `booking` cannot see which sets are free on a
date either, so the candidate pool is a new `venue::api` read composed inside `venue` from the active
map and `SetAvailabilityLookup#takenOn`, the same composition the tourist map makes; (5) tier is a
`String` token everywhere with no enum, so "same or better tier" needs a published `Tier` mirror of
`set_position_tier_check` (ADR-0018 §3), from which `SetCommand`'s token set now derives; (6)
`BookingStatus` is unexported and `canStillBeHonoured` is the only liveness statement, so the
port answers outcome kinds, never statuses; (7) no open PR, no Flyway number in play; the sibling
#1032 closed out on the epic with PR #1050 and `docs/plans/diff-based-bulk-save.md` retires in this
close-out; (8) a new POST under `/api/venues/**` falls through to `anyRequest().authenticated()`
unless `SecurityConfig` names it — `EndpointRoleGateCoverageTest` fails the build otherwise; (9) the
root controller is bootstrapped by every `@ApplicationModuleTest`, so its two ports join
`PayoutModuleTest`'s and `ReviewSubmitFlowIT`'s mock lists and `WebSliceStubs`) · `riviera-plan-doc`
(this template — forced a seam per AC, the module-ownership table for the two arms of the
classification, and the parity ledger as N/A with its reason) · `tdd` (each phase red first at the
named seam: the two holders against a fixed clock, the services through their ports with fakes, the
HTTP ITs, the Vitest specs, the mocked e2e) · `riviera-review-overlay` (ran on PR #1051 over `17597d20..46be319c`, then the fix range
`46be319c..4537cb9b`; findings F-2..F-12 in Execution status, all fixed) · `riviera-docs-freshness` (ran over
`17597d20..75d78e76`, 5 findings, all patched: `/remodel/` in `riviera-modulith`'s slice list, the two slice
enumerations in `booking/package-info` and `PackageShapeArchitectureTests`, `BeachMapRemodel` in
`venue/api/package-info`, and ADR-0018 §3's mirror count with `Tier` as the second published mirror; the
rename grep for `application.SetPlacement`/`disturbedBy`/`diff-based-bulk-save` and the counting sweep
over `booking.api`'s ports and the root grant answered empty) · `grilling` (the intake questions answered from the
code; the calls a colleague would make — advisory read, two transactions, candidate allocation order,
booking id on the wire — are recorded as resolved assumptions below) · `riviera-local-debug` (clone
unshallowed; system Gradle on the JDK 21 daemon compiling on the JDK 25 toolchain; scoped `--tests`;
the structural net after the port and grant changes; the module tests for the root-bean blast radius;
the mocked e2e via `PW_CHROMIUM_EXECUTABLE`) · `postgres` (no schema change; every new read is
index-served: the placements read and the free-sets read scan `set_position_venue_id_idx` through the
view, the holds read and the live-bookings read take the `(set_id, booking_date)` leftmost prefixes;
the free-sets read is one active-map select plus one `takenOn` select per date, subtracted in the adapter, rather than N per-set probes; the preview
runs `readOnly` and takes no row lock, so it never queues a claim's `FOR KEY SHARE`) ·
`riviera-modulith` (two new `api/` ports, one per module, each a "call-me" interface; the classification
value types are `booking.vocabulary` sealed outcomes and records, the preview outcome and the tier a
`venue.vocabulary` sealed outcome and enum; `SetPlacement` graduates to `venue.vocabulary` because the
port's input is a placement; one new `spi` method on `SetAvailabilityLookup`, implemented by
`availability`; the root's grant map gains `venue`/`booking` `api`+`vocabulary` and nothing else; no
event — the caller needs the answer now) · `codebase-design` (the preview port takes the same cells
the save takes and answers disturbed sets — the diff stays one calculation with two callers, so
`LayoutDiff` grows `disturbedBy` beside `of` instead of a second matcher; the two holders are the
deep parts: the service is procedure over them; `RemodelClaims` is one method because the edge asks one
question) · `domain-modeling` (`CONTEXT.md` gains **Remodel zone**, **Move candidate**, **Move
distance**; ADR-0020 passes the three tests — hard to reverse, surprising against the discipline test's
own Javadoc, a real trade-off) · `riviera-java-conventions` (records; sealed outcomes with
single-constant enums for the data-less variants like `ReplaceLayoutOutcome.Replaced`; `Optional` on
the query; `readOnly` transactions; the error contract — `STALE_WRITE`/`NO_SUCH_VENUE` codes reused
verbatim; no booking code on the wire, invariant #7; one-line inline comments) · `riviera-frontend`
(all new files in `operator/`; the wire types join `operator-console.model.ts`, the call
`operator-console.service.ts`; the dialog is a sibling component of `shared/confirm-panel.ts` rather
than a variant, because it must own a list; no new cross-feature edge) · `angular-developer` +
angular-cli MCP (`get_best_practices` for the v22 workspace re-read; `search_documentation` verified:
`signal`/`computed` — the dialog's open state and the preview payload are plain signals, the
"removes a loaded set" question a `computed` over `grid` and `loadedSets`; `linkedSignal` — not
adopted, no state here is derived-then-overridden; `resource`/`httpResource` — not adopted, the
preview is an imperative write-shaped POST on `firstValueFrom(HttpClient)` like every write in the
editor; Signal Forms — no form; `@if`/`@for` with `track` for the five groups) · `riviera-tailwind`
(verified against tailwindcss.com: `aria-disabled:` is a first-party boolean-ARIA variant, which is
how the busy save renders; `[&_svg]:size-[…]` descendant arbitrary variant for the lock glyph;
`motion-reduce:` for the panel's pop; `@theme inline` is what makes `bg-riv-warn-fill` /
`text-riv-warn-ink` utilities; no `@apply`; the panel reuses the warn surface and the three console
tones — no new token, no literal; the only new contrast pairs are the warn ink and the card ink over
the warn fill in both console themes) · `playwright-cli` (the mocked suite: one spec driving the
five-group dialog, its `alertdialog` semantics, the busy save, the back-out focus leg and the
skip-the-dialog path, with axe over the open panel after `settle`).

**Branch:** `claude/riviera-booking-api-ovks4j` (the session's designated remote branch stands in
for `feature/remodel-preview`).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a booking on 15 July and the freeze window 24h / notice floor 96h, when the zone
  is asked at 23:00 on 13 July and at 00:30 on 14 July (`Europe/Tirane`), then both answer
  `MOVE_ONLY`; for a booking on 19 July both answer `MOVE_OR_REFUND`; a booking whose day opens in
  exactly 24h, or already opened, is `FROZEN`. *Seam:* `RemodelZones#zoneOf(LocalDate, Instant)` ·
  *Pinned by:* `RemodelZonesTest.*`
- [x] **AC-2:** Given a claim on A3 (row A, position 3, grid row 1) and a candidate pool, when the
  ranking runs, then it picks the same row first, then the closest position, then the closest row,
  never a worse tier, never a walk-in set, never another date, and reports rows-away and
  positions-away. *Seam:* `MoveRanking#pick(SetSpot from, LocalDate date, List<FreeSpot> pool)` ·
  *Pinned by:* `MoveRankingTest.*`
- [x] **AC-3:** Given live bookings on the disturbed sets, when classified, then a frozen claim is
  `Blocked(FROZEN)`, a move-only claim with no candidate is `Blocked(NO_MOVE_CANDIDATE)`, a claim
  with a candidate is `Move`, and with no candidate beyond the floor `CONFIRMED` is `Refund`,
  `AWAITING_PAYMENT` is `Release`, `PENDING_REQUEST` is `Decline`; two claims on one date never share a
  candidate; a non-owner is refused before any read. *Seam:* `booking.api.RemodelClaims#classify` with
  fakes · *Pinned by:* `RemodelClaimsServiceTest.*`
- [x] **AC-4:** Given a venue with a live booking on A1, a staff hold on A3 and a pool switch on A2,
  when the owner previews a layout that keeps every cell but repaints A2, then the answer is
  `Disturbing([])`; when it drops A1 and A3, then the answer names A1 and A3 with A3's hold dates; a
  stale token answers `Rejected(STALE_WRITE)`, an unknown venue `Rejected(NO_SUCH_VENUE)`, and a
  non-owner is refused first. *Seam:* `venue.api.BeachMapRemodel#preview` with fakes · *Pinned by:*
  `BeachMapPreviewServiceTest.*`
- [x] **AC-5:** Given the owner's session, when `POST /api/venues/{v}/beach-map/preview` carries the
  save body, then the response carries the five groups and `keep`, nothing is written, the token
  does not advance; a non-owner gets `403 NOT_VENUE_OWNER`; a stale token `409 STALE_WRITE`; a
  repaint-only body answers every group empty without asking `booking`. *Seam:* HTTP
  `POST /api/venues/{venueId}/beach-map/preview` · *Pinned by:* `RemodelPreviewIT.*`,
  `CrossVenueDenialIT.previewIsDeniedForANonOwner`
- [x] **AC-6:** `ModularityTests` and the structural net are green with the two new ports, the root
  grant and the `spi` method; `CompositionRootDisciplineTests` admits `venue`/`booking`
  `api`+`vocabulary` only; `EndpointRoleGateCoverageTest` sees the POST gated. *Seam:* the net +
  the two named tests · *Pinned by:* the net command in `CLAUDE.md`
- [x] **AC-7:** Given the editor loaded a trading venue, when the operator paints a loaded set to a
  gap and saves, then the editor POSTs the preview first; an all-empty answer proceeds straight to
  the PUT; a non-empty answer opens an `alertdialog` listing the five groups (move with "A3 → A7,
  4 positions", refund with amount, release/decline, staff hold with dates, block with the set to
  keep) and a link to the bookings tab, the save button is `aria-disabled` while it is open, and Back
  closes it and returns focus to Save; a save that removes no loaded set never previews. *Seam:* the `LayoutEditor` DOM through the mocked `HttpTestingController` ·
  *Pinned by:* `layout-editor.spec.ts` "previews…" cases, `remodel-preview-panel.spec.ts`,
  `remodel-preview-panel.a11y.spec.ts`, `remodel-preview-panel.contrast.spec.ts`
- [x] **AC-8:** Given a mocked preview answering the five groups, when the operator saves from the
  running SPA, then the dialog renders each group, axe is clean, the save is `aria-disabled`, Back
  restores focus to Save, a moves-only answer still offers Back alone, and a preview answering
  nothing goes straight to the PUT. *Seam:* the
  running SPA against `page.route` mocks · *Pinned by:* `frontend/e2e/layout-editor.e2e.ts`
  "previews the remodel…" cases
- [x] **AC-9:** `CONTEXT.md` defines Remodel zone, Move candidate and Move distance;
  `RESPONSIBILITIES.md` § `venue`, § `booking` and § *Platform edge* describe the preview and its
  orchestration home; ADR-0020 records the root grant. *Seam:* the docs · *Pinned by:* review
  (RV-PROC), `riviera-docs-freshness` at close-out

## Non-goals

- The commit: moving a booking, `STALE_PREVIEW`, the preview token, the receipt, the refund count
  and reason (#1034 and later). The bulk save's behaviour is unchanged: it refuses any disturbed
  set a live claim pins (`409 SETS_IN_USE`).
- `BookingMoved`, the move mail, the free exit, the fee (#1034, #1035, #1036).
- A drag-move gesture or set ids on the PUT body.
- Locking the map for the preview; a preview is a snapshot (Assumptions).
- The layout-shape rejections on the preview (`EMPTY_LAYOUT`, `DUPLICATE_POSITION`, …): the save
  states them; the editor already refuses a duplicate row name and an empty grid before either call.
- Undoing the tourist visibility fence on the owner's read (the #1031 note).

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. The save's request, responses and the editor's refusal
handling are untouched; the dialog sits before the PUT, never instead of it.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The preview's two read-only transactions see different snapshots, or a claim lands between preview and save (invariant #2) | med | low | the preview is advisory by contract (Javadoc on both ports); the save re-decides under its row locks and this slice's save refuses any live claim; `STALE_PREVIEW` is #1034's | session | closed — both ports' Javadoc state the advisory read; `RemodelPreviewIT` proves nothing is written and the token holds; the save's refusal is unchanged |
| R-2 | The root grant weakens the composition-root rule for every future root class | low | med | the grant is the narrowest surfaces (`api`+`vocabulary`), the test's Javadoc names the one sanctioned reason (the remodel orchestration, ADR-0020), and `ApplicationModules.verify()` still holds the module graph | session | closed — `CompositionRootDisciplineTests` grants `api`+`vocabulary` only and its negative proofs stand; ADR-0020 |
| R-3 | Ownership on the venue-scoped endpoint (BOLA, invariant #13) | low | high | both application services assert `VenueOwnership#assertOwns` first; the edge only resolves the principal; `CrossVenueDenialIT` probes the route | session | closed — `CrossVenueDenialIT.remodelPreviewByNonOwnerIs403`; both services call `assertOwns` before any read (`RemodelClaimsServiceTest`, `BeachMapPreviewServiceTest`) |
| R-4 | A new POST under `/api/venues/**` reachable by any authenticated principal | med | high | an explicit `POST /api/venues/*/beach-map/preview` OPERATOR matcher; `EndpointRoleGateCoverageTest` | session | closed — `BEACH_MAP_PREVIEW_PATH` POST `hasRole(OPERATOR)`; `EndpointRoleGateCoverageTest` green |
| R-5 | `@ApplicationModuleTest` contexts fail on the root controller's new ports (blast radius) | high | med | the two ports join `PayoutModuleTest`'s and `ReviewSubmitFlowIT`'s `@MockitoBean` lists and `WebSliceStubs`; both module tests run before the push | session | closed — `PayoutModuleTest` mocks both ports, `WebSliceStubs` supplies them; every `@ApplicationModuleTest` green in CI |
| R-6 | Two claims on one date allocated the same candidate | med | med | the service allocates in `(bookingDate, bookingId)` order and removes a picked candidate from that date's pool; `RemodelClaimsServiceTest` | session | closed — `RemodelClaimsServiceTest.oneCandidateServesOneClaimPerDateAndADisturbedSetIsNeverACandidate` |
| R-7 | Zone arithmetic across midnight / DST (invariants #4, #6) | med | med | durations to `BookingCutoff#serviceDayOpensAt` (Tirane midnight as a UTC instant); `RemodelZonesTest` crosses midnight and the exact boundaries | session | closed — `RemodelZonesTest` crosses midnight (49h / 47.5h to open) and pins the two boundaries |
| R-8 | Error-contract drift on the new endpoint | low | med | `NOT_VENUE_OWNER` via the advice, `STALE_WRITE`/`NO_SUCH_VENUE`/`INVALID_REQUEST` through `ApiProblem`, detail states the condition | session | closed — `RemodelPreviewIT` pins `403`/`409`/`400` bodies and the detail twin against the PUT (F-7, F-12) |
| R-9 | The console literal sweep or the focus-posture guard fails the new panel | low | low | token-only classes; `[appBusy]` on the save; `focusMover` on all three legs | session | closed — `console-literal-sweep.spec.ts`, `check-focus-posture.mjs` and `check-touch-target.mjs` green on the panel |
| R-10 | Booking code on the wire (invariant #7) | low | high | the wire carries the booking id, never the code; `RemodelPreviewIT` asserts no `code` field | session | closed — `RemodelPreviewIT` asserts no `code` field; `remodel-preview-panel.spec.ts` asserts no "code" in the dialog text |

## Open questions / Assumptions

### Resolved

- **The dialog is informational in this slice: the five groups, the sets to keep, Back only.** A
  non-empty preview means a live claim on a disturbed set, which this slice's PUT refuses, so a Save
  in the dialog would only promise what the commit (#1034) delivers; the Save joins the dialog with
  the commit — resolved at the review gate (F-3).

- **The orchestration home is the root package, granted `venue`/`booking` `api`+`vocabulary`.** The
  epic's decision (rev. 2), reaffirmed in the ticket; ADR-0020 records it and the alternatives — plan time.
- **A "moved" set is `LayoutDiff#disturbed()`**: removed or repositioned, no identity-keeping move
  exists on this write — plan time (#1032 close-out).
- **The preview is a snapshot, read-only, non-locking, in two transactions** — the save decides — plan time.
- **Candidates are allocated in `(bookingDate, bookingId)` order**, earliest booking first — plan time.
- **`MoveRanking` is pure, so it sits in `booking/domain`** (ADR-0018 §2); `RemodelZones` needs the
  clock and sits in `booking/application/remodel` — plan time.
- **The wire carries the booking id and the amount, never the code** — plan time.
- **The staff-hold group is `venue`'s arm** (an availability fact through the SPI); the four booking
  groups are `booking`'s; `keep` is the union of the block sets and the held sets — plan time.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none. The preview writes nothing; the
  save is unchanged.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` (V4), untouched.
- **Concurrency strategy:** the preview takes no lock (`readOnly` on both services); it is a
  snapshot the save re-decides under its `FOR UPDATE` order (venue row, then every active set row).
  A candidate the preview names may be claimed before the commit — #1034's token hashes outcome kinds,
  not candidates, for exactly this reason.
- **Pool rule (invariant #3):** a move candidate is `ONLINE`-pool only (`MoveRanking`); walk-in
  holds are their own group and block.
- **Cutoff rule (invariant #4):** sales close plays no role in the zones; the zone is a duration to
  `serviceDayOpensAt` (`BookingCutoff`, `Europe/Tirane`). The hold arm's "today" is `LiveClaims#today()`.
- **Pinning test:** none new — no write path; `BeachMapDiffConcurrencyIT` still pins the save.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | — (reads `active_set_position`, `venue`) | owns the beach map and the diff; answers what a save disturbs |
| M-2 | `booking` | existing | — (reads `booking`) | owns the lifecycle; classifies its own claims, decides refund/release/decline and the move |
| M-3 | `availability` | existing | — (reads `set_availability`) | implements the walk-in-holds read on `venue.spi.SetAvailabilityLookup` |
| M-4 | root (not a module) | existing | — | the platform edge composes the two ports (ADR-0020) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `BeachMapRemodel#preview(OperatorId, VenueId, long expectedVersion, List<SetPlacement>)` | `LayoutPreview` (sealed: `Disturbing(List<DisturbedSet>)`, `Rejected(PreviewRejection)`), `DisturbedSet`, `SetPlacement`, `PreviewRejection` | root |
| NI-2 | `venue.api` | `SetBookingFacts#activeSetsOf(VenueId)`, `#freeOnlineSetsOn(VenueId, LocalDate)` | `SetSpot(SetId, SetPlacement, Tier, Pool)`, `Tier` | `booking` |
| NI-3 | `booking.api` | `RemodelClaims#classify(OperatorId, VenueId, Collection<SetId>)` | `RemodelClaim`, `RemodelOutcome` (sealed: `Move`, `Refund`, `Release`, `Decline`, `Blocked`), `BlockReason`, `SpotRef` | root |
| NI-4 | `venue.spi` | `SetAvailabilityLookup#walkInHoldsFrom(Collection<SetId>, LocalDate)` | `SetId` | implemented by `availability` |

**Domain events:** none — the caller needs the answer now (a synchronous query, like `DailyTakings`).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Diff the submitted cells against the active map and name the disturbed sets, without writing | `venue` | `venue` Job: the beach map and its layout writes; the same `LayoutDiff` the save uses; **not** `booking` (Not-My-Job: the venue map) |
| Which disturbed sets carry a walk-in hold and on which dates | `venue` (through `availability`'s SPI implementation) | the hold arm `LiveClaims` already composes; `availability` owns the row, `venue` renders the answer, as for the map |
| Which sets are free on a date, with tier and placement | `venue` composing `SetAvailabilityLookup#takenOn` | `venue` renders free-ness for the tourist map the same way; `booking` cannot read availability |
| The zone of a claim | `booking` (`RemodelZones`) | a choice with a clock (ADR-0018 §2); the epic names `booking`'s application layer |
| The move candidate and its distance | `booking` (`MoveRanking`) | a pure choice (ADR-0018 §2 → `domain/`); **not** `venue` — the epic keeps ranking with the claims |
| Refund / release / decline by status | `booking` | `booking` Job: the lifecycle and the refund **decision**; `BookingStatus` stays unexported |
| Assembling the five groups and `keep` for the wire | root | the platform edge composes; ADR-0020 |
| Asserting the actor owns the venue | `venue` and `booking` services, each | invariant #13: in the application service, never the controller |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Amounts on the wire are the bookings' snapshotted `amount_minor` +
currency, read, never computed.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` + `.html` | existing | standalone component | `removesLoadedSet` computed over `grid`/`loadedSets`; `previewing`, `preview` signals; save `[appBusy]` while previewing or the dialog is open | none |
| FE-2 | `operator/remodel-preview-panel.ts` + `.html` | new | standalone `alertdialog` component (sibling of `shared/confirm-panel.ts`) | `input.required<RemodelPreview>()`, `output` cancelled (Back only — the commit is #1034's); focuses Back on open | none |
| FE-3 | `operator/operator-console.model.ts` / `.service.ts` | existing | model + `@Service` | `RemodelPreview` wire types, `previewLayout(venueId, body)` | — |

**Standards:** standalone, `inject()`, native control flow with `track`, signal state, `[appBusy]`
never `[disabled]` on the pressed control, `focusMover` on the three legs — no deviation.

## FE↔BE contract

- **New endpoint:** `POST /api/venues/{venueId}/beach-map/preview` — request is the save body
  (`{ sets: [{ rowLabel, positionNo, tier, pool, price, gridX, gridY }], expectedVersion }`; the
  edge reads only `rowLabel`, `positionNo`, `gridX`, `gridY`). Response `200`:
  ```json
  { "moves":      [{ "bookingId": 7, "bookingDate": "2026-09-20", "amount": { "minorUnits": 3500, "currency": "EUR" },
                    "from": { "setId": 1, "rowLabel": "A", "positionNo": 3 },
                    "to":   { "setId": 5, "rowLabel": "A", "positionNo": 7 }, "rowsAway": 0, "positionsAway": 4 }],
    "refunds":    [{ "bookingId", "bookingDate", "amount", "from" }],
    "releases":   [{ "bookingId", "bookingDate", "amount", "from", "kind": "RELEASE" | "DECLINE" }],
    "staffHolds": [{ "set": { "setId", "rowLabel", "positionNo" }, "dates": ["2026-09-12"] }],
    "blocks":     [{ "bookingId", "bookingDate", "amount", "from", "reason": "FROZEN" | "NO_MOVE_CANDIDATE" }],
    "keep":       [{ "setId", "rowLabel", "positionNo" }] }
  ```
  Failures: `403 NOT_VENUE_OWNER`, `404 NO_SUCH_VENUE`, `409 STALE_WRITE`, `400 INVALID_REQUEST`.
  No booking code anywhere (invariant #7).
- **Client typing:** hand-written `RemodelPreview` and its element types in
  `operator-console.model.ts`; no `as any`.
- **Money/date on the wire:** minor units + currency; ISO `YYYY-MM-DD`.

## Execution status

**Stage pointer:** `DONE — merged via PR #1051`

**Next action:** none — the commit (#1034) is the next slice of epic #1027.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the zone holder + properties | ✅ | f893073e |
| 1 — the ranking holder + `Tier` | ✅ | 0a6bb174 |
| 2 — `booking`: the live-claims read, the service, the `api` port | ✅ | a76eb986 |
| 3 — `venue`: `SetPlacement` published, the preview service + port, the facts reads, the SPI method | ✅ | cfc5c2ee |
| 4 — the edge: controller, security, stubs, ITs, the grant, ADR-0020, the net | ✅ | the "Answer the remodel preview at the edge" commit |
| 5 — the editor: model, service, panel, wiring, Vitest + a11y + contrast | ✅ | 052dca0a |
| 6 — the mocked e2e | ✅ | 779b9d61 |
| 7 — docs: CONTEXT, RESPONSIBILITIES, Javadoc; close-out | ✅ | the docs went with phase 4 (ADR-0020, CONTEXT, RESPONSIBILITIES); close-out in the PR's last code-touching commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-3 | review (prior-PR-comments reviewer) | the dialog offered "Save layout" and said "Saving moves them as listed" while this slice's PUT still refuses every live claim — a promise the backend cannot keep until #1034 | fixed — the dialog is informational: the five groups, the sets to keep, Back only; the Save and the F-2 machinery leave with it |
| F-4 | review (prior-PR-comments reviewer) | `LayoutEditor`'s class TSDoc still described the refuse-outright flow only | fixed — names the dry run and the panel |
| F-5 | review (code-comment reviewer) | `warn-token-skin.contrast.spec.ts`'s `SITES` claims every site painting the warn family, and the new panel was not on it | fixed — both panel files join the sweep |
| F-6 | review (code-comment reviewer) | `LiveClaims`'s class Javadoc framed the class as two callers of one question; `walkInHoldsOn` is a third | fixed — the Javadoc names it |
| F-7 | review (CLAUDE.md/overlay reviewer, RV-BE-10) | the root's `STALE_WRITE`/`NO_SUCH_VENUE` details diverged from the venue module's and named "layout" | fixed — the same two sentences; `RemodelPreviewIT` pins the detail |
| F-8 | review (CLAUDE.md/overlay reviewer) | `LayoutDiff#of` and `#disturbedBy` each walked the cells with their own map — two matchers that could drift | fixed — one private `matchByCell`; `LayoutDiffTest.thePreviewAndTheSaveDisturbTheSameSetsForOneLayout` |
| F-9 | review (CLAUDE.md/overlay reviewer) | the plan's `postgres` line claimed a `NOT EXISTS` anti-join the code does not use | fixed — the line states the two-select subtraction |
| F-10 | re-review of the fix round | `SetCommand#placement()` landed between `disturbs`' Javadoc and `disturbs` — the two methods swapped their doc | fixed — 75d78e76 |
| F-11 | re-review of the fix round | `RemodelPreviewPanel`'s class TSDoc still described a Save (prettier had joined the lines the first edit targeted) | fixed — 75d78e76 |
| F-12 | re-review of the fix round (RV-BE-10) | the stale-token detail was asserted on the preview only, with no twin against the save | fixed — `RemodelPreviewIT` drives the stale PUT beside the stale preview and holds both to one sentence; the `NO_SUCH_VENUE` arm is unreachable over HTTP, since ownership asserts first and an unknown venue is nobody's (403) |
| F-2 | review (shallow bug scan) | the dialog's Save re-read the grid at confirm time, so a cell painted behind the open dialog shipped un-previewed | fixed, then superseded by F-3 — with no Save in the dialog there is no confirm to carry a body |
| F-13 | sonar (java:S1192 on `JdbcSetAvailabilityLookup`) | the third `rs.getLong("set_id")` the holds read added tripped the duplicated-literal rule | fixed — a `SET_ID` column constant, the customer adapters' precedent; new code otherwise 0 issues, 0 duplicated blocks, 93.5% new-code coverage |
| F-1 | CI (`Backend (build + test)` on 42a9f039) | `JdbcBookingsLiveClaimsIT` seeded booking codes `LIVE0001…` that `JdbcBookingPresenceIT` also seeds; green alone, `DuplicateKeyException` on `booking_code_uniq` in the full suite's shared database | fixed — codes and addresses minted per insert (`LC-<nanoTime>`); both classes green in one JVM |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelProperties.java` — `riviera.booking.remodel.*` (new)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelConfig.java` — binds `RemodelWindows` (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelWindows.java` — the two durations (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelZones.java` — the zone holder (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsService.java` — the classification (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/LiveClaim.java` — a live booking on a disturbed set (new)
- `platform/src/main/java/ai/riviera/platform/booking/domain/RemodelZone.java` — the enum (new)
- `platform/src/main/java/ai/riviera/platform/booking/domain/MoveRanking.java` — the ranking holder (new)
- `platform/src/main/java/ai/riviera/platform/booking/domain/FreeSpot.java` — a free set on a date (new)
- `platform/src/main/java/ai/riviera/platform/booking/api/RemodelClaims.java` — the port (new)
- `platform/src/main/java/ai/riviera/platform/booking/api/package-info.java` — the fourth port
- `platform/src/main/java/ai/riviera/platform/booking/package-info.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RemodelClaim.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/RemodelOutcome.java` — sealed (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/BlockReason.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/SpotRef.java` — (new)
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — `findLiveOnSets`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — the read
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — `LIVE_STATUSES` shared
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/Tier.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetPlacement.java` — moved from `application`
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/SetSpot.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/LayoutPreview.java` — sealed (new)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/DisturbedSet.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/PreviewRejection.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/api/BeachMapRemodel.java` — the port (new)
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java` — the two reads
- `platform/src/main/java/ai/riviera/platform/venue/api/package-info.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — `walkInHoldsFrom`
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapPreviewService.java` — (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutDiff.java` — `disturbedBy`
- `platform/src/main/java/ai/riviera/platform/venue/application/SetCommand.java` — `disturbs`, `Tier`
- `platform/src/main/java/ai/riviera/platform/venue/application/SetPlacement.java` — removed (moved)
- `platform/src/main/java/ai/riviera/platform/venue/application/PlacedSet.java` — import
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapEditService.java` — `disturbs`
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `setVersionOf`, `placedSetsOf`
- `platform/src/main/java/ai/riviera/platform/venue/application/LiveClaims.java` — `walkInHoldsOn`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the reads
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcSetBookingFacts.java` — the reads
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — the holds read
- `platform/src/main/java/ai/riviera/platform/RemodelPreviewController.java` — the edge (new)
- `platform/src/main/java/ai/riviera/platform/RemodelPreviewRequest.java` — the body (new)
- `platform/src/main/java/ai/riviera/platform/RemodelPreviewResponse.java` — the wire groups (new)
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — the POST matcher
- `platform/src/main/resources/application.properties` — the two properties
- `platform/src/test/java/ai/riviera/platform/booking/adapter/in/RemodelPropertiesTest.java` — (new)
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelZonesTest.java` — AC-1 (new)
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsServiceTest.java` — AC-3 (new)
- `platform/src/test/java/ai/riviera/platform/booking/domain/MoveRankingTest.java` — AC-2 (new)
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingsLiveClaimsIT.java` — `findLiveOnSets` (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/BeachMapPreviewServiceTest.java` — AC-4 (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/LayoutDiffTest.java` — `disturbedBy`
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — fakes
- `platform/src/test/java/ai/riviera/platform/venue/application/LiveClaimsTest.java` — fake
- `platform/src/test/java/ai/riviera/platform/venue/application/DailyAvailabilityServiceTest.java` — fake
- `platform/src/test/java/ai/riviera/platform/venue/SetSpotsIT.java` — the two spot reads (new)
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java` — the holds read
- `platform/src/test/java/ai/riviera/retirefixture/venue/adapter/out/FixtureSetFacts.java` — the port grows
- `platform/src/test/java/ai/riviera/platform/RemodelPreviewIT.java` — AC-5 (new)
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — AC-5
- `platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java` — the grant
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the two ports
- `platform/src/test/java/ai/riviera/platform/payout/PayoutModuleTest.java` — the two ports
- `platform/src/test/java/ai/riviera/platform/review/ReviewSubmitFlowIT.java` — the two ports
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancellationPolicyTermsTest.java` — fake, if the port grows a default-less method
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — fake
- `platform/src/test/java/ai/riviera/platform/notification/application/BookingMailFactsServiceTest.java` — fake
- `platform/src/test/java/ai/riviera/platform/notification/application/MailDeliveryLookupServiceTest.java` — fake
- `frontend/src/app/operator/operator-console.model.ts` — the wire types
- `frontend/src/app/operator/operator-console.service.ts` — `previewLayout`
- `frontend/src/app/operator/operator-console.service.spec.ts` — the call
- `frontend/src/app/operator/remodel-preview-panel.ts` — (new)
- `frontend/src/app/operator/remodel-preview-panel.html` — (new)
- `frontend/src/app/operator/remodel-preview-panel.spec.ts` — (new)
- `frontend/src/app/operator/remodel-preview-panel.a11y.spec.ts` — (new)
- `frontend/src/app/operator/remodel-preview-panel.contrast.spec.ts` — (new)
- `frontend/src/app/operator/layout-editor.ts` — the preview step
- `frontend/src/app/operator/layout-editor.html` — the panel
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-7
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — the open panel
- `frontend/src/app/shared/warn-token-skin.contrast.spec.ts` — the panel joins the warn-skin site sweep
- `frontend/e2e/layout-editor.e2e.ts` — AC-8
- `CONTEXT.md` — three terms
- `RESPONSIBILITIES.md` — § venue, § booking, § Platform edge
- `docs/adr/ADR-0020-remodel-orchestration-at-the-composition-root.md` — (new)
- `docs/plans/remodel-preview.md` — this plan
- `docs/plans/diff-based-bulk-save.md` — retired at close-out
- `docs/adr/ADR-0018-rule-layer-and-its-packaging.md` — the mirror count and `Tier` as the second published mirror (docs-freshness)
- `.claude/skills/riviera-modulith/SKILL.md` — `/remodel/` joins the booking slice list (docs-freshness)
- `platform/src/test/java/ai/riviera/platform/PackageShapeArchitectureTests.java` — the slice list in its Javadoc (docs-freshness)

---

## Phase 0 — the zone holder + properties

**Files:** Create `RemodelZone.java`, `RemodelWindows.java`, `RemodelZones.java`, `RemodelProperties.java`, `RemodelConfig.java` · Modify `application.properties` · Test `RemodelZonesTest.java`, `RemodelPropertiesTest.java`

- [ ] **Step 1: Write the failing test** — AC-1: the midnight pair for a booking two days out
  (`MOVE_ONLY` both times), the pair for a booking six days out (`MOVE_OR_REFUND` both times), exactly
  24h before open → `FROZEN`, one second more → `MOVE_ONLY`, exactly 96h → `MOVE_ONLY`, one second
  more → `MOVE_OR_REFUND`, an opened day → `FROZEN`.
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*RemodelZonesTest*"` → compilation failure
- [ ] **Step 3: Minimal implementation** — `zoneOf(date, now)`: `until = Duration.between(now, cutoff.serviceDayOpensAt(date))`; `until <= freeze` → `FROZEN`; `until <= floor` → `MOVE_ONLY`; else `MOVE_OR_REFUND`.
- [ ] **Step 4: Run it, verify it passes**
- [ ] **Step 5: Generalization audit** — N/A, no bug fix
- [ ] **Step 6: Commit** — `Classify a remodel claim into a zone by its duration to service-day open (#1033)`

## Phase 1 — the ranking holder + `Tier`

**Files:** Create `Tier.java`, `SetSpot.java`, `FreeSpot.java`, `MoveRanking.java` · Modify `SetCommand.java` · Test `MoveRankingTest.java`

- [ ] **Step 1: Failing test** — AC-2 cases.
- [ ] **Step 2: Run** — `--tests "*MoveRankingTest*"` → FAIL
- [ ] **Step 3: Implement** — filter date, `ONLINE`, `tier.atLeast(from.tier)`; order by same row, `|Δposition|`, `|Δrow|`, id.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 6: Commit** — `Rank a booking's move candidates: same row, closest position, closest row, never worse (#1033)`

## Phase 2 — `booking`: the live-claims read, the service, the port

**Files:** Create the vocabulary records, `RemodelClaims.java`, `LiveClaim.java`, `RemodelClaimsService.java` · Modify `Bookings.java`, `JdbcBookings.java`, `JdbcBookingPresence.java`, the two `package-info.java` · Test `RemodelClaimsServiceTest.java`, `JdbcBookingPresenceIT.java`

- [ ] **Step 1: Failing tests** — AC-3 with a Mockito `Bookings` and `SetBookingFacts`, a fixed clock.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** — assert ownership; read live claims; per date build the pool from `freeOnlineSetsOn` minus the disturbed ids; classify in order.
- [ ] **Step 4: Run** → PASS; `ModularityTests`.
- [ ] **Step 6: Commit** — `Classify the live claims on a set list through booking's remodel port (#1033)`

## Phase 3 — `venue`: the preview service + port

**Files:** Move `SetPlacement` · Create `LayoutPreview.java`, `DisturbedSet.java`, `PreviewRejection.java`, `BeachMapRemodel.java`, `BeachMapPreviewService.java` · Modify `LayoutDiff.java`, `SetCommand.java`, `BeachMapEditService.java`, `Venues.java`, `JdbcVenues.java`, `LiveClaims.java`, `SetBookingFacts.java`, `JdbcSetBookingFacts.java`, `SetAvailabilityLookup.java`, `JdbcSetAvailabilityLookup.java`, the fakes · Test `BeachMapPreviewServiceTest.java`, `LayoutDiffTest.java`, `JdbcSetBookingFactsIT.java`, `JdbcSetAvailabilityLookupIT.java`

- [ ] **Step 1: Failing tests** — AC-4; `disturbedBy`; the two facts reads and the holds read against Postgres.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; the structural net.
- [ ] **Step 6: Commit** — `Preview a beach-map save: the disturbed sets and their walk-in holds, without writing (#1033)`

## Phase 4 — the edge

**Files:** Create `RemodelPreviewController.java`, `RemodelPreviewRequest.java`, `RemodelPreviewResponse.java`, `RemodelPreviewIT.java`, ADR-0020 · Modify `SecurityConfig.java`, `CompositionRootDisciplineTests.java`, `WebSliceStubs.java`, `PayoutModuleTest.java`, `ReviewSubmitFlowIT.java`, `CrossVenueDenialIT.java`

- [ ] **Step 1: Failing ITs** — AC-5.
- [ ] **Step 2: Run** — one class at a time → FAIL
- [ ] **Step 3: Implement** — parse, compose, assemble; the matcher; the grant.
- [ ] **Step 4: Run** → PASS; the net; `EndpointRoleGateCoverageTest`; `PayoutModuleTest`; `ReviewSubmitFlowIT`.
- [ ] **Step 6: Commit** — `Answer the remodel preview at the edge: five groups and the sets to keep (#1033)`

## Phase 5 — the editor

**Files:** the `operator/` files listed above.

- [ ] **Step 1: Failing specs** — AC-7.
- [ ] **Step 2: Run** — `npm test -- remodel-preview layout-editor` → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `npm run lint`, `npm run format:check`, `npm run test:a11y`
- [ ] **Step 6: Commit** — `Show the remodel preview before a save that removes sets (#1033)`

## Phase 6 — the mocked e2e

- [ ] AC-8 green under `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- layout-editor`
- [ ] **Commit** — `Drive the remodel preview dialog end to end (#1033)`

## Phase 7 — docs and close-out

- [x] CONTEXT.md, RESPONSIBILITIES.md, Javadoc sweep; `docs/plans/diff-based-bulk-save.md` retired.
- [x] Plan doc execution status; `node scripts/check-plan-file-structure.mjs --diff origin/main`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-09 | F-1 | every IT that inserts a `booking` row with a literal code (the full suite shares one database, so two classes seeding one literal collide) | `grep -rn 'INSERT INTO booking' platform/src/test/java -l` then the literal codes each seeds | `JdbcBookingPresenceIT` (`LIVE`/`TERM`/`PRES`+index), `RemodelPreviewIT` (`RM-`+nanoTime), `BeachMapReplaceIT` (`BK-venue-set`), the new class (`LIVE`+index — the collision) | fixed the new class only; every other prefix is distinct per class |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-6 (backend):** `gradle --no-daemon --console=plain test --tests "*RemodelZonesTest*" --tests "*MoveRankingTest*" --tests "*RemodelClaimsServiceTest*" --tests "*BeachMapPreviewServiceTest*" --tests "*RemodelPreviewIT*" --tests "*CrossVenueDenialIT*" --tests "*CompositionRootDisciplineTests*" --tests "*EndpointRoleGateCoverageTest*"` green, plus the structural net command from `CLAUDE.md`; the full suite green in CI (`Backend (build + test)`) on the PR head.
- [x] **AC-7:** `npx ng test --watch=false --include='**/layout-editor*.spec.ts' --include='**/remodel-preview-panel*.spec.ts' --include='**/warn-token-skin.contrast.spec.ts'` green; the whole Vitest suite green in CI.
- [x] **AC-8:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/layout-editor.e2e.ts` green; the mocked suite green in CI.
- [x] **AC-9:** the terms, the three `RESPONSIBILITIES.md` bullets and ADR-0020 read at the review gate (RV-PROC-2) and by the `riviera-docs-freshness` run recorded in *Skills consulted*.

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
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
