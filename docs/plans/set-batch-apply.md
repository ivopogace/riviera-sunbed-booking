# Set batch apply + the reserve-time pool rule Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator sweeps twenty sets on a venue that has sold and changes their price, tier
and/or pool in one owner-asserted transaction that answers "20 sets updated"; a booked set keeps
its bookings on their dates whatever pool it now draws from, a set switched to walk-in refuses
every new online reserve while a staff mark on its booked date is still refused, and the staff
daily view lists the online booking on the now-walk-in set.

**Architecture:** Two decisions, both in `venue`. (1) **The pool is a sales-channel attribute,
not a physical one** (epic #1027 revision 3): invariant #3 is a *reserve-time* rule enforced by
`booking`'s fast path and `availability`'s locked claim-time read, so the set-edit guard drops the
pool from `SetPlacement.disturbedBy` and only a position move or a removal asks the claim
question. (2) **The batch apply gets its own endpoint**, `PATCH /api/venues/{venueId}/sets`
(the set collection), off the delete-all-and-insert replace: one transaction that locks the venue
row (the `set_version` token) and then the named set rows `FOR UPDATE` — the same order every
set-write takes — and writes the touched columns with one `COALESCE` `UPDATE`. The set-row
`FOR UPDATE` is not a claim probe; it is what serialises a pool flip against a claim's
`FOR KEY SHARE` pool read, so a racing reserve decides against the committed pool.

**Persistence:** JDBC only (invariant #1). No schema change, no Flyway migration: `set_position`
already carries every column the batch writes; `venue.set_version` is the existing token.

**Source of intent:** GitHub issue #1029 (parent epic #1027, revision 3 — user stories 10–11).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that the
staff daily view's SQL never joined `set_position`, so its AC is a pin, not a fix; that the daily
takings comment, not its SQL, carries the "booking row implies online set" assumption; that
`SetWriteVsClaimConcurrencyIT.claimAndPoolFlipCannotBothWin` asserts the very rule this slice
retires and must be rewritten as "the claim never lands on a pool it did not read committed"; that
the per-set `removeSet` does not bump `set_version`, so a batch can meet an id another tab
deleted and must answer `NO_SUCH_SET` before writing; zero open PRs, no Flyway number in play;
the epic has no earlier sibling to close out) · `riviera-plan-doc` (this template — forced a seam
per AC and the module-ownership table for a rule that spans three modules) · `tdd` (each phase
red first at the named seam: the service fake, the controller IT, the concurrency IT, the Vitest
spec, the mocked e2e) · `riviera-review-overlay` (review gate — due at ready-for-review; not yet
run) · `riviera-docs-freshness` (**due at close-out** over the merge base: the slice changes what
`RESPONSIBILITIES.md` § `venue` and § *Invariants, long form* #3 state) · `grilling` (the intake
questions answered from the code; every product call is the epic's revision 3, recorded under
*Open questions* as reversible) · `riviera-local-debug` (the clone unshallowed; system Gradle on
the JDK 21 daemon compiling on 25; scoped `--tests`; the structural net after the port change;
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e) · `riviera-modulith` (the
new write stays behind `venue`'s internal `EditBeachMap` port — no `api/` change, no new `spi/`,
no event; `ChangeOutcome`/`SetRejection` reused; no `allowedDependencies` change; structural net
due after the port grows a method) · `riviera-java-conventions` (a `SetBatchCommand` record with a
compact constructor, nullable "untouched" fields validated both-or-neither, a sealed
`SetBatchOutcome`, `ApiProblem` for rejections, §6c/§6d on every touched Javadoc — the retired
rule's rationale relocates to `RESPONSIBILITIES.md`) · `codebase-design` (the batch is one more
method on the existing `EditBeachMap` conversation, not a fifth port; `Venues` gains
`lockSets` + `updateSetFields` beside `lockSetsOfVenue`/`updateSet`, the same seam the replace
uses) · `domain-modeling` (`CONTEXT.md`'s **Pool** entry gains the reserve-time sentence; no ADR —
the decision is recorded on the epic and in `RESPONSIBILITIES.md`, and it is reversible) ·
`postgres` (`UPDATE … SET col = COALESCE(:p::type, col) WHERE venue_id = :venue AND id IN (:ids)`
rides `set_position_venue_id_idx` + the PK; the explicit casts keep a null bind typed; venue row
before set rows keeps the lock order acyclic with the replace and the reprice; `FOR UPDATE` on the
set rows is the lock that conflicts with the claim's `FOR KEY SHARE`) · `riviera-frontend` (the
change stays inside `operator/`: `set-editor.ts`, `operator-console.service.ts`,
`operator-console.model.ts`; the e2e is the CI-safe mocked suite; no folder or edge change) ·
`angular-developer` + angular-cli MCP (`list_projects`: one workspace, Angular 22, Vitest;
`get_best_practices` v22: signals, `computed`, `linkedSignal`, `input()`/`output()`, native control
flow, no `standalone: true`/OnPush; `search_documentation` v22 verified `linkedSignal` (the batch
draft re-seeds off the sweep — kept), `signal`/`computed` (`batchUpdated` is a plain `signal<number
| null>`, no `effect`), `resource` (not used — the write is a one-shot `firstValueFrom` on the
existing HTTP service, as every other console write), Signal Forms (the batch price field already
binds through `form()` — unchanged), `@if`/`@for` (the outcome `<output>` stays under `@if`); what
changed because of it: nothing new was introduced, the rewire keeps the panel's existing signal
shape) · `riviera-tailwind` (verified against tailwindcss.com/docs: arbitrary values
`text-[12.5px]` and theme-variable utilities via `@theme inline` (`text-riv-console-accent-ink`
emits `var(--riv-console-accent-ink)`), and that sharing is by component/directive, never
`@apply`; the outcome line reuses the existing `<output data-testid="batch-saved">` element and
its classes, so no new utility and no new token; the existing contrast row "saved notice over
porcelain stops" covers it) · `playwright-cli` (`page.route` per method on the sets collection;
the mock refuses only a move on the claimed set now).

**Branch:** `claude/set-edit-walk-in-rule-waslfk` — the session's designated remote branch stands
in for `feature/set-batch-apply` (riviera-sdlc, remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a set with a `BOOKED_ONLINE` hold dated 30 days out, when the owner edits it
  from `ONLINE` to `WALK_IN` keeping its position, then the edit is `Applied` and the hold row
  survives; when the owner instead moves it to another cell, then it is `Rejected(SET_IN_USE)`.
  *Seam:* `EditBeachMap#editSet` · *Pinned by:*
  `VenueAdminServiceTest.editSetAppliesAPoolOnlyChangeToAClaimedSet`,
  `VenueAdminServiceTest.editSetIsRefusedWhenABookedSetWouldBeMovedToAnotherCell`,
  `VenueAdminControllerIT.editSetRepoolsAClaimedSetAndKeepsItsHold`.
- [ ] **AC-2:** Given a set with a `CONFIRMED` booking on date D switched to `WALK_IN`, when a
  tourist posts an online reserve for it on any other date, then the reserve is refused
  `SET_NOT_BOOKABLE_ONLINE`; when staff mark it on D, then the mark is refused `ALREADY_TAKEN`.
  *Seam:* `POST /api/bookings` and `POST /api/venues/{v}/sets/{s}/availability` (HTTP) ·
  *Pinned by:* `PoolSwitchOnBookedSetIT.aWalkInSwitchRefusesNewOnlineReservesAndKeepsTheBookedDateClaimed`.
- [ ] **AC-3:** Given that set, when the owner reads the staff daily view for D, then the booking
  is listed on that set id. *Seam:* `GET /api/venues/{v}/bookings?date=` · *Pinned by:*
  `PoolSwitchOnBookedSetIT.theDailyViewShowsTheOnlineBookingOnTheNowWalkInSet`.
- [ ] **AC-4:** Given the claim and a pool flip racing, when either commits first, then the flip
  always applies, the claim is `CLAIMED` iff it reached its lock first, and a claim that lost the
  lock answers `NOT_ONLINE_POOL` — never a hold decided against a pool that had already changed.
  *Seam:* `EditBeachMap#editSet` / `EditBeachMap#applyToSets` racing `AvailabilityClaim#claim` ·
  *Pinned by:* `SetWriteVsClaimConcurrencyIT.claimNeverLandsOnAPoolItDidNotReadCommitted`,
  `SetWriteVsClaimConcurrencyIT.batchRepoolSerialisesWithTheClaim`.
- [ ] **AC-5:** Given three sets, two booked, when the owner applies `{tier, pool, price}` to all
  three with the current `set_version`, then all three rows carry the new values, the hold rows are
  untouched, the response is `200 {updated: 3}` and `set_version` advanced by one. *Seam:*
  `PATCH /api/venues/{v}/sets` · *Pinned by:* `SetBatchApplyIT.appliesToBookedSetsAndKeepsTheirHolds`.
- [ ] **AC-6:** Given a stale `expectedVersion`, when the batch is posted, then `409 STALE_WRITE`
  and no row changes; given a set id not on the venue, then `404 NO_SUCH_SET` and no row changes;
  given no field, an empty id list or a missing token, then `400 INVALID_REQUEST`. *Seam:*
  `PATCH /api/venues/{v}/sets` · *Pinned by:* `SetBatchApplyIT.staleVersionRefusesTheWholeBatch`,
  `SetBatchApplyIT.aForeignSetIdRefusesTheWholeBatch`, `SetBatchApplyIT.rejectsAnEmptyBatch`,
  `SetBatchCommandTest`.
- [ ] **AC-7:** Given a non-owner operator, when they post a batch, then `403 NOT_VENUE_OWNER`
  before any read. *Seam:* `EditBeachMap#applyToSets` + HTTP · *Pinned by:*
  `VenueAdminServiceTest.batchByANonOwnerIsDeniedBeforeAnyRead`,
  `SetBatchApplyIT.nonOwnerIsForbidden`.
- [ ] **AC-8:** Given the batch service, when it applies, then the venue row lock precedes the set
  row locks and the token is advanced once, on success only. *Seam:* `EditBeachMap#applyToSets`
  over the `Venues` fake · *Pinned by:* `VenueAdminServiceTest.batchLocksTheVenueRowThenTheSetRows`.
- [ ] **AC-9:** Given a swept selection with a touched price, when the operator applies, then the
  panel sends one `PATCH …/sets` carrying only the swept ids and the touched field, and renders
  "2 sets updated"; a `STALE_WRITE` keeps the sweep and emits `staleWrite`; a `NO_SUCH_SET`
  renders its own message. *Seam:* `OperatorConsoleService#applySetBatch` (HttpTestingController)
  and the rendered panel · *Pinned by:* `set-editor.spec.ts` ("sends one batch PATCH with the swept
  ids and the touched field", "renders the number of sets updated", "explains a NO_SUCH_SET
  batch-apply refusal"), `set-editor.a11y.spec.ts` ("has no axe violations with a batch outcome
  rendered"), `set-editor.contrast.spec.ts` (existing saved-notice row).
- [ ] **AC-10:** Given the mocked console on a trading venue, when the operator sweeps two sets
  and applies a price, then exactly one `PATCH …/sets` fires, the outcome reads "2 sets updated",
  and the claimed set's pool can be switched from the single-set panel while a move is refused.
  *Seam:* the browser against `page.route` mocks · *Pinned by:*
  `operator-set-editing.e2e.ts` ("sweeps a block, applies a price change to all of them in one
  batch PATCH", "a booked set can change pool but not move or be removed").
- [ ] **AC-11:** Given the structural net, when it runs after the port change, then it is green.
  *Seam:* `ModularityTests` + the four architecture tests · *Pinned by:* the CLAUDE.md command.

## Non-goals

- Retiring `LAYOUT_IN_USE`, the shared `layoutErrorOf` mapper or the bulk save's copy (#1032).
- Retire-not-delete, the diff-based save, pinned cells, preview/commit (#1030–#1035).
- A pre-warn probe on the batch panel; the server answer is the truth.
- Changing the daily takings SQL — it already counts every settled booking regardless of pool.
- A real-backend Playwright spec (the ticket asks for the mocked suite only).
- Renaming `SetRejection.SET_IN_USE` or its `detail`: the condition class "a booking or a current
  hold" stays true at every remaining arm (move, remove).

## Behavior-parity ledger (retirement / replacement slices only)

The batch panel's apply moves from `PUT …/beach-map` to `PATCH …/sets`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| One write per apply, `expectedVersion`-guarded | preserved | one `PATCH`, same `setVersion` token, `STALE_WRITE` → `staleWrite` output + kept sweep |
| Untouched fields keep each set's own value | preserved | the body carries only touched fields; the server `COALESCE`s per column |
| Sets outside the sweep never re-sent | preserved (stronger) | only swept ids are sent at all |
| `LAYOUT_IN_USE` → "locked, edit one at a time" | dropped | the endpoint has no venue-wide claim guard; the branch is gone from `batchErrorMessage()` |
| "Saved. The public beach map reflects your change." | changed | "N sets updated. The public beach map reflects your change." (the ticket's outcome copy) |
| `INVALID_REQUEST` client-side price check | preserved | unchanged |
| `UNAUTHORIZED` → `sessionLost()` | preserved | unchanged |
| `NO_SUCH_VENUE` message | preserved | unchanged |
| `DUPLICATE_POSITION`/`CELL_TAKEN`/`EMPTY_LAYOUT`/`LAYOUT_TOO_LARGE` | dropped | unreachable: the batch moves nothing and inserts nothing |
| — | new | `NO_SUCH_SET` → "One of the selected sets no longer exists. Reload the tab to see the current map." |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A claim racing a pool flip lands a `BOOKED_ONLINE` row after the flip committed (a stale pool read) | low | high | the batch and the edit take `FOR UPDATE` on the set rows; `poolForClaim` reads `FOR KEY SHARE`; pinned by `SetWriteVsClaimConcurrencyIT` (both orders forced) | session | open |
| R-2 | Deadlock between a batch and a replace/reprice on the same venue | low | med | every set-write takes the venue row first, then set rows (R-1 of the replace plan); the batch does the same | session | open |
| R-3 | A batch meets a set id removed by another tab (per-set writes don't bump `set_version`) | med | low | lock the named rows first; fewer rows than ids → `NO_SUCH_SET` before any write | session | open |
| R-4 | BOLA on the new `/api/venues/{venueId}/sets` PATCH | low | high | `ownership.assertOwns` first in `applyToSets`; `SecurityConfig` rule `PATCH /api/venues/*/sets` → `OPERATOR`; IT pins 403 | session | open |
| R-5 | A staff-marked or booked date read as "online" somewhere that assumed pool from a booking row | low | med | grep of production SQL and prose for the assumption: only the takings comment (reworded); the daily view joins no pool | session | open |
| R-6 | Error-contract drift: a new request DTO and a new 200 body | low | low | `INVALID_REQUEST` via `InvalidApiRequestException.parsing`; rejections via `ApiProblem`; `detail` states the condition | session | open |
| R-7 | Sonar: new-code coverage < 80% on the command/DTO validation branches | med | low | `SetBatchCommandTest` + `SetBatchRequestTest` unit tests cover every branch | session | open |

## Open questions / Assumptions

- **Assumption:** `PATCH /api/venues/{venueId}/sets` (collection PATCH, body names the members)
  is the "new endpoint under the venue's set resources" the ticket asks for — *Owner:* session ·
  *Resolves by:* phase 2 (reversible: a path rename touches the controller, the service client and
  the e2e mock only).
- **Assumption:** a set id not on the venue refuses the whole batch (`404 NO_SUCH_SET`) rather
  than skipping it, so "20 sets updated" is never a lie — *Owner:* session · *Resolves by:* phase 2.
- **Assumption:** the response reports the count (`{updated: n}`) — the ticket's "reports the sets
  changed" read as a count, since the panel renders "N sets updated" and the ids are the request's
  own — *Owner:* session · *Resolves by:* phase 2.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none added or changed. The batch and
  the edit write `set_position` only; a hold row is never touched, so a booked date stays claimed
  through any pool switch.
- **Uniqueness guarantee:** `UNIQUE (set_id, booking_date)` on `set_availability`, unchanged.
- **Concurrency strategy:** the set-writes take `SELECT … FOR UPDATE` on the set rows (per-set
  `lockSet`; the batch's `lockSets`) after the venue row (`lockAndReadSetVersion`). The claim's
  `poolForClaim` reads `FOR KEY SHARE`, which conflicts with `FOR UPDATE` (and not with the
  `FOR NO KEY UPDATE` a plain `UPDATE` would take — which is why the explicit lock stays), so a
  claim and a pool flip serialise: whichever commits first, the claim decides against the committed
  pool. A move or a removal still probes `hasLiveHold`/`BookingPresence` under that lock.
- **Pool rule (invariant #3):** a *reserve-time* rule. `booking`'s `ReserveSetService` fast path
  and `availability`'s `JdbcAvailabilityClaim` refuse a `WALK_IN` set at claim time, both against
  `venue.vocabulary.Pool`. The set-edit guard no longer refuses a pool change: the existing hold
  stays on its `(set, date)` row, staff marks are pool-agnostic already, and only a new online
  reserve consults the pool.
- **Cutoff rule (invariant #4):** untouched.
- **Pinning test:** `SetWriteVsClaimConcurrencyIT.claimNeverLandsOnAPoolItDidNotReadCommitted`
  and `.batchRepoolSerialisesWithTheClaim` (both orders forced, six repetitions each);
  `.claimAndRemoveCannotBothWin` unchanged.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `set_position`, `venue.set_version` | Job: the beach map, set positions, the pool assignment, pricing |
| M-2 | `booking` | existing (comment only) | — | `JdbcDailyTakings` Javadoc reworded; no code change |

**Cross-module named interfaces (`api/` ports)** — none added or changed. `EditBeachMap` is an
internal `application/` port (REST-only caller); `Venues` an internal driven port.

**Domain events** — none.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| the batch write of tier/pool/price over named sets | `venue` | `venue` Job: "set positions, the online-vs-walk-in pool assignment for each set, pricing"; not `availability` (Not-My-Job: the map/pricing/pool rules → `venue`) |
| deciding a pool switch disturbs no claim | `venue` | the set-edit guard is `venue`'s layout-write rule; the reserve-time check stays where it is — `booking` (fast path) and `availability` (claim) — and neither changes |
| the daily view listing a booking on a walk-in set | `booking` | already true: `findSettledForVenueOn` joins no pool; pinned, not changed |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. A booking's charge is snapshotted at reserve time; repricing a booked
set never alters it (the settled rule the batch extends to the pool).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` + `.html` | existing | standalone component | signals: `batchUpdated = signal<number \| null>`, `batchErrorCode`, `batchDraft` (`linkedSignal` off the sweep) | Signal Forms (price field, unchanged) |
| FE-2 | `operator/operator-console.service.ts` | existing | `@Service` HTTP service | `applySetBatch()` → `Observable<SetBatchResult>`; `setBatchErrorOf()` | — |
| FE-3 | `operator/operator-console.model.ts` | existing | types | `SetBatchRequest`, `SetBatchResult`, `SetBatchErrorCode` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. No deviation.

## FE↔BE contract

- **New endpoint:** `PATCH /api/venues/{venueId}/sets` — body
  `{ setIds: number[], tier?: 'PREMIUM'|'STANDARD', pool?: 'ONLINE'|'WALK_IN', price?: MoneyView, expectedVersion: number }`
  (at least one of `tier`/`pool`/`price`; 1 ≤ `setIds.length` ≤ 1040, no duplicates required).
  `200 { updated: number }`; `400 INVALID_REQUEST`; `403 NOT_VENUE_OWNER`; `404 NO_SUCH_VENUE` /
  `NO_SUCH_SET`; `409 STALE_WRITE`.
- **Changed behavior:** `PATCH /api/venues/{venueId}/sets/{setId}` no longer answers
  `409 SET_IN_USE` for a pool-only change on a claimed set.
- **Client typing:** hand-written typed service (`SetBatchRequest`/`SetBatchResult`), no `as any`.
- **Money/date on the wire:** `MoneyView` integer minor units + currency; no dates.

## Execution status

**Stage pointer:** `review gate` (CI green on `bf451252`; Sonar's first list cleared)

**Next action:** run the review gate on PR #1038 over the resolved range (`references/pr-gates.md` §1), then re-read the Sonar list on the new head.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | |
| 1 — the reserve-time pool rule (guard, ITs, docs, Javadoc, takings comment) | ✅ | `71b8f366` |
| 2 — the batch endpoint (backend) | ✅ | `505a444f` |
| 3 — the batch panel rewire (frontend + e2e) | ✅ | the phase-3 commit (this plan update rides in it) |
| 4 — PR gates + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar (java:S1192) | `"priceMinor"` literal three times in `JdbcVenues` | fixed — `P_PRICE_MINOR` constant |
| F-2 | sonar (java:S1192) | `"priceCurrency"` literal three times in `JdbcVenues` | fixed — `P_PRICE_CURRENCY` constant |
| F-3 | sonar (java:S6539, info) | `VenueAdminService` depends on 21 classes (max 20) | fixed — `Set.copyOf(…toList())` drops `Collectors`, `hasLiveHold` takes a `List` and drops `Collection`: 19 |

---

## File structure

- `docs/plans/set-batch-apply.md` — this plan
- `RESPONSIBILITIES.md` — § `venue` layout-write paragraph; § *Invariants, long form* #3
- `CONTEXT.md` — the **Pool** entry: a reserve-time rule
- `.claude/skills/riviera-java-conventions/references/error-contract.md` — the `STALE_WRITE` set-write count
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — `PATCH /api/venues/*/sets` → `OPERATOR`
- `platform/src/main/java/ai/riviera/platform/venue/application/SetPlacement.java` — `disturbedBy` drops the pool
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — `editSet` Javadoc; `applyToSets`
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — `applyToSets`; Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/application/SetBatchCommand.java` — the validated batch intent
- `platform/src/main/java/ai/riviera/platform/venue/application/SetBatchOutcome.java` — sealed outcome
- `platform/src/main/java/ai/riviera/platform/venue/application/SetCommand.java` — shares the tier vocabulary
- `platform/src/main/java/ai/riviera/platform/venue/application/SetRejection.java` — Javadoc (`SET_IN_USE`, `STALE_WRITE`)
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `lockSets`, `updateSetFields`; `lockSet` Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the two new statements
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — the batch mapping
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetBatchRequest.java` — the request body
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcDailyTakings.java` — the takings comment
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the `EditBeachMap` stub grows `applyToSets`
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/PoolToken.java` — the one pool-token parse
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/SetPositionRequest.java` — parses through `PoolToken`
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — pool rule + batch unit tests, fake
- `platform/src/test/java/ai/riviera/platform/venue/application/SetBatchCommandTest.java` — validation
- `platform/src/test/java/ai/riviera/platform/venue/adapter/in/SetBatchRequestTest.java` — body parsing
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — the repool IT
- `platform/src/test/java/ai/riviera/platform/venue/SetWriteVsClaimConcurrencyIT.java` — rewritten race + batch race
- `platform/src/test/java/ai/riviera/platform/venue/PoolSwitchOnBookedSetIT.java` — reserve/mark/daily view
- `platform/src/test/java/ai/riviera/platform/venue/SetBatchApplyIT.java` — the batch HTTP seam
- `frontend/src/app/operator/set-editor.ts` · `.html` · `.spec.ts` · `.a11y.spec.ts` — the rewire
- `frontend/src/app/operator/operator-console.service.ts` · `.spec.ts` — `applySetBatch`, `setBatchErrorOf`
- `frontend/src/app/operator/operator-console.model.ts` — batch types
- `frontend/e2e/operator-set-editing.e2e.ts` — the batch route + the repool test

---

## Phase 1 — The reserve-time pool rule

**Files:** Modify `SetPlacement.java`, `EditBeachMap.java`, `VenueAdminService.java`,
`SetRejection.java`, `Venues.java`, `BookingPresence.java`, `JdbcDailyTakings.java`,
`RESPONSIBILITIES.md`, `CONTEXT.md` · Test `VenueAdminServiceTest`, `VenueAdminControllerIT`,
`SetWriteVsClaimConcurrencyIT`, `PoolSwitchOnBookedSetIT`

- [ ] **Step 1: Write the failing tests** — `VenueAdminServiceTest.editSetAppliesAPoolOnlyChangeToAClaimedSet`
  (a `WALK_IN` command on a live-held set → `APPLIED`, `updatedSets == 1`);
  `everyPlacementFieldOnItsOwnDisturbsAClaimedSet` asserts `pool` does NOT disturb;
  `VenueAdminControllerIT.editSetRepoolsAClaimedSetAndKeepsItsHold` (204, pool `WALK_IN`, hold
  count 1); `SetWriteVsClaimConcurrencyIT.claimNeverLandsOnAPoolItDidNotReadCommitted` (flip
  always `Applied`; `holdsOn == claimWon ? 1 : 0`; a lost claim is `NOT_ONLINE_POOL`);
  `PoolSwitchOnBookedSetIT` (AC-2, AC-3).
- [ ] **Step 2: Run, verify red** — `gradle --no-daemon --console=plain test --tests "*VenueAdminServiceTest*"` → FAIL (`SET_IN_USE`).
- [ ] **Step 3: Minimal implementation** — `SetPlacement.disturbedBy` drops `pool != command.pool()`;
  Javadocs and prose reworded; `JdbcDailyTakings` comment: the sum is by venue and date, a
  booking row on a set now in the walk-in pool still counts, so no pool filter either way.
- [ ] **Step 4: Run, verify green** — the four classes above, one at a time.
- [ ] **Step 5: Generalization-audit pass** — population: every production statement or Javadoc
  that derives a set's pool from the existence of a booking or refuses a pool change; enumerate
  `grep -rn -i "repool\|pool flip\|online-pool set\|walk-in inventory" platform/src/main frontend/src RESPONSIBILITIES.md CONTEXT.md`.
- [ ] **Step 6: Commit** — `Let a booked set change pool: invariant #3 is a reserve-time rule (#1029)`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — The batch endpoint

**Files:** Create `SetBatchCommand.java`, `SetBatchOutcome.java`, `SetBatchRequest.java`,
`SetBatchCommandTest.java`, `SetBatchRequestTest.java`, `SetBatchApplyIT.java` · Modify
`EditBeachMap.java`, `VenueAdminService.java`, `Venues.java`, `JdbcVenues.java`,
`VenueAdminController.java`, `SecurityConfig.java`, `SetCommand.java` · Test
`VenueAdminServiceTest`, `SetWriteVsClaimConcurrencyIT.batchRepoolSerialisesWithTheClaim`

- [ ] **Step 1: Write the failing tests** — `SetBatchCommandTest` (empty ids, too many, no field,
  price both-or-neither, bad tier); `VenueAdminServiceTest.batch*` (applies + token once; stale →
  `STALE_WRITE` no write; missing id → `NO_SUCH_SET` no write; lock order `lockAndReadSetVersion`
  then `lockSets`; non-owner throws before any read); `SetBatchApplyIT` (AC-5/6/7).
- [ ] **Step 2: Run, verify red** — compile failure on the missing port method.
- [ ] **Step 3: Minimal implementation** — port + record + outcome + service method + `Venues`
  methods + `JdbcVenues` SQL + controller `@PatchMapping("/{venueId}/sets")` + security rule.
- [ ] **Step 4: Run, verify green** — `VenueAdminServiceTest`, `SetBatchCommandTest`,
  `SetBatchRequestTest`, `SetBatchApplyIT`, `SetWriteVsClaimConcurrencyIT`, then the structural net.
- [ ] **Step 5: Generalization-audit pass** — population: every `venue.set_version`-guarded write
  (`grep -n "lockAndReadSetVersion" platform/src/main`); each takes the venue row first and bumps on
  success only — the batch joins the population.
- [ ] **Step 6: Commit** — `Add the per-set batch apply endpoint off the replace call (#1029)`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — The batch panel rewire

**Files:** Modify `set-editor.ts` · `.html` · `.spec.ts` · `.a11y.spec.ts`,
`operator-console.service.ts` · `.spec.ts`, `operator-console.model.ts`,
`operator-set-editing.e2e.ts`

- [ ] **Step 1: Write the failing tests** — spec: one `PATCH …/sets` with `{setIds:[10,11],
  price, expectedVersion}` and no `tier`/`pool`; "2 sets updated" rendered; `NO_SUCH_SET` copy;
  `LAYOUT_IN_USE` test removed; the `save` copy no longer mentions the pool; service spec for
  `applySetBatch` + `setBatchErrorOf`; a11y with the outcome rendered; e2e batch + repool.
- [ ] **Step 2: Run, verify red** — `npx vitest run src/app/operator/set-editor.spec.ts`.
- [ ] **Step 3: Minimal implementation** — model types, service method + mapper, `applyBatch()`
  rewired, `batchUpdated` signal, template outcome, `batchErrorMessage()` cases, copy.
- [ ] **Step 4: Run, verify green** — the specs, `npm run lint`, `npm run format:check`, the
  mocked e2e file with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
- [ ] **Step 5: Generalization-audit pass** — population: every client string that states the
  pool rule (`grep -rn -i "repool\|pool and position" frontend/src frontend/e2e`).
- [ ] **Step 6: Commit** — `Rewire the batch panel to the batch endpoint and report the count (#1029)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-08 | phase 3 | every client string that states the pool rule to the operator | `grep -rn -i "repool\|pool and position" frontend/src frontend/e2e` (non-spec files) | `set-editor.ts` class TSDoc + `SetWrite` doc + the `save`/`move` copy; `operator-console.model.ts` `SetWriteErrorCode` doc; `operator-console.service.ts` `editSet` doc; the e2e's booked-set test | all reworded; the two `layout-editor.spec.ts` comments narrate a test's own repool through the child (still a valid action) and stand |
| 2026-09-08 | phase 2 | every `venue.set_version`-guarded write: takes the venue row first and advances the token on success only | `grep -n "lockAndReadSetVersion" platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` | `repriceRow`, `renameRow`, `replaceLayout`, `applyToSets` | all four follow the order; the batch joins the population with the same shape |
| 2026-09-08 | phase 1 | every production statement or prose line that refuses a pool change or derives a set's pool from a booking row | `grep -rn -i "repool\|pool flip\|online-pool set\|walk-in inventory" platform/src/main frontend/src RESPONSIBILITIES.md CONTEXT.md` | `EditBeachMap#removeSet` Javadoc ("repool or reposition"); `pricing-tab` projection (sums online-pool sets — a sales projection, still correct); `venue-map.ts` ("ONLINE-pool sets are bookable" — the reserve-time rule, correct); thread-pool matches (noise) | reworded the one Javadoc; the rest stand |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-8, AC-11:** scoped Gradle runs + CI green on the PR head.
- [ ] **AC-9:** `npx vitest run src/app/operator` green.
- [ ] **AC-10:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts e2e/operator-set-editing.e2e.ts` green.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
