# Beach-Map Row Rename Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator whose venue has already sold can rename one beach-map row —
`B` → `Back row` — through a row-scoped, display-only write that never touches set
identity, pool, coordinates or any hold, so the two layout locks (`LAYOUT_IN_USE`,
`SET_IN_USE`) that today make a rename unreachable on a trading venue no longer stand
in the way.

**Architecture:** A new `PUT /api/venues/{venueId}/rows/{rowLabel}/name` built as the
**exact analogue of `repriceRow`** — the same `set_version` optimistic token, the same
ownership-first application service, the same "no claim probe, because nothing a claim
depends on changes" argument, the same rows-affected-as-existence-check. The most
significant decision, taken at the intake grill: the rename is **row-scoped**, not a
relaxation of `SetPlacement.disturbedBy`. `disturbedBy` is per-set, so widening it would
let one set's label change while its row-mates keep theirs — splitting a row — and
`editSet` has no duplicate-label guard, so it could merge two rows one set at a time.
Row cohesion is exactly what `groupSetsByRow` and the layout editor's duplicate-name
check exist to protect. Second decision, correcting the issue sketch: the new label is
refused if **any other row already carries it**, not merely on a `(row_label,
position_no)` collision — a non-colliding duplicate trips no constraint but silently
merges two physical rows into one on the tourist map and in the pricing tab.

**Persistence:** JDBC only (invariant #1). **No migration** — `set_position.row_label`
already exists (V2), its ≤ 40 code-point bound is already `set_position_row_label_check`
(V43, #723), and `set_position_cell_uniq` (V2) is already the hard backstop. The slice
adds two statements to `JdbcVenues` and no DDL. (V44 is free on `main` and unclaimed —
the 18 open PRs are all Dependabot bumps — but nothing here claims it.)

**Source of intent:** GitHub issue #726 (deferred from #723, PR #725).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — established
that `row_label` is stored on `set_position` **only**, so no booking/mail row snapshots it;
surfaced the silent row-merge hole in the issue's collision rule; confirmed no migration is
needed and no open PR claims a Flyway number) · `riviera-plan-doc` (this template — its
Module-ownership table forced the "why `venue`, not `booking`" answer for the sold-booking
consequence, and the Risk register forced R-3's probe-then-write race to be written down
rather than discovered at review) · `tdd` (each phase red-first; scoped test commands per
phase below) · `riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (`N/A` at plan time — due pre-merge over `origin/main...HEAD`;
`RESPONSIBILITIES.md` §`venue`'s layout-lock bullet is the known target, since the "price
and tier stay editable on a claimed set" sentence becomes "price, tier and the row name")
· `riviera-modulith` (kept `renameRow` on the existing `EditBeachMap` port rather than a
sixth port — Cockburn's "same purposeful conversation"; the new outcome value goes on the
shared `SetRejection` in `application`, not a published surface, since no other module
sees it) · `riviera-java-conventions` (`RowNameCommand` as a record with compact-constructor
validation reusing `VenueFieldValidation.MAX_ROW_LABEL_LENGTH`, so the Java bound and the
V43 CHECK stay in lockstep §6a; typed outcome not exception §6; text-block SQL; §6b error
contract needs no controller-advice change) · `postgres` (the duplicate probe written as a
single `EXISTS` riding the `set_position_cell_uniq (venue_id, row_label, …)` index prefix,
with the self-rename exclusion folded into the predicate rather than a second round trip)
· `riviera-frontend` (all new FE code stays in `operator/`; no new cross-feature edge — the
existing `operator/ → venue/` edge is untouched; the e2e spec goes in the mocked CI suite)
· `angular-developer` + angular-cli MCP (`get_best_practices` for the v22 posture: signals,
no `ngClass`, `class` bindings, mandatory axe pass — confirmed the workspace is Angular 22,
Vitest) · `riviera-tailwind` (utilities only, no new `.scss`; `[appTouchTarget]` on the new
per-row button; `text-[14px]` not `text-sm`) · `playwright-cli` (mocked-suite spec authoring
and the PUT-body assertion pattern `layout-editor.e2e.ts` already uses) · `riviera-local-debug`
(cloud Gradle recipe + scoped-test discipline — to load before the session's first
`./gradlew`/`npm`)

**Branch:** `claude/sdlc-726-followup-prompt-wd21nn` — the session's designated remote
branch, standing in for `feature/beach-map-row-rename` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with a `CONFIRMED` booking on a set in row `B`, when
  `EditBeachMap#renameRow` is called with the venue's current `set_version` and
  `RowNameCommand("B", "Back row")`, then it answers `ChangeOutcome.Applied` and every set
  formerly labelled `B` reads `Back row` — no hold, booking, pool, coordinate or set id
  changed. *Pinned by:* `VenueRowRenameIT.renamesARowOnAVenueThatHasSold`.
- [ ] **AC-2:** Given a venue whose rows are `A` and `B`, when a rename of `B` to `A` is
  requested, then it answers `Rejected(ROW_NAME_TAKEN)` (→ `409`) and both rows keep their
  labels — even though the two rows' `(row_label, position_no)` pairs would not collide.
  *Pinned by:* `VenueRowRenameIT.refusesANameAnotherRowAlreadyCarries` +
  `VenueAdminServiceTest.rejectsARenameOntoAnotherRowsLabel`.
- [ ] **AC-3:** Given a rename whose source and target label are identical, when it is
  requested, then it answers `Applied` (a no-op rename is not a duplicate).
  *Pinned by:* `VenueAdminServiceTest.allowsARenameToTheSameLabel`.
- [ ] **AC-4:** Given a rename carrying an `expectedVersion` that another writer has since
  bumped, when it is requested, then it answers `Rejected(STALE_WRITE)` (→ `409`), no label
  changes, and `set_version` is left untouched so the acting tab's own retry off the same
  value still works. *Pinned by:* `VenueRowRenameIT.refusesAStaleRename`.
- [ ] **AC-5:** Given a rename naming a row label no set on the venue carries, when it is
  requested, then it answers `Rejected(NO_SUCH_ROW)` (→ `404`) and `set_version` is not
  advanced. *Pinned by:* `VenueRowRenameIT.refusesAnUnknownRow`.
- [ ] **AC-6:** Given an authenticated operator who does not own the path `venueId`, when a
  rename is requested, then the **application service** refuses with `403` before any read
  or write (invariant #13). *Pinned by:* `VenueRowRenameIT.refusesACrossVenueRename` +
  the standing `CrossVenueDenialIT` probe.
- [ ] **AC-7:** Given a new label of 41 code points, when the request is parsed into
  `RowNameCommand`, then it is rejected with `IllegalArgumentException` → `400
  INVALID_REQUEST` at the edge, and a 40-code-point Unicode label is accepted.
  *Pinned by:* `RowNameCommandTest.rejectsANewLabelOverTheLengthBound` +
  `RowNameCommandTest.acceptsANewLabelAtTheLengthBound`.
- [ ] **AC-8:** Given the layout tab's Row names panel on a venue with saved sets, when the
  operator edits row `B`'s name and activates its per-row save, then a single
  `PUT /api/venues/{id}/rows/B/name` carries `{ newLabel, expectedVersion }`, the panel shows
  that row saved, and the bulk layout Save stays independently locked.
  *Pinned by:* `layout-editor.spec.ts` ("saves one row's name without the bulk save") + e2e
  `layout-editor.e2e.ts` ("renames a row on a venue whose bulk save is locked").
- [ ] **AC-9:** Given a per-row rename that answers `409 ROW_NAME_TAKEN`, when it returns,
  then the panel shows that row's inline error, the row's draft name is left as typed for
  correction, and `set_version` is not advanced locally. *Pinned by:*
  `layout-editor.spec.ts` ("surfaces a taken row name against the row that asked").
- [ ] **AC-10:** Given a per-row rename that answers `409 STALE_WRITE`, when it returns,
  then the editor's existing stale-write banner and Reload path own the recovery (one
  recovery surface, not a second) . *Pinned by:* `layout-editor.spec.ts` ("routes a stale
  rename into the reload banner").

## Non-goals

- Relaxing `SetPlacement.disturbedBy` or any other part of the `editSet` / `replaceLayout`
  lock. Both stay exactly as they are; this slice adds a path beside them.
- Renaming a row from the **pricing** tab. The intake grill settled the surface as the
  layout tab's Row names panel; a second surface would duplicate the write and its
  stale-token recovery in two components.
- Renaming a row on a grid that has been generated but never saved — there is no stored row
  to rename, and the bulk Save already writes those labels.
- Any change to what a **guest** sees. The rename is live for booked guests by design (see
  Risk R-2); no snapshotting, no mail re-send, no "row was renamed" notice.
- Reordering, splitting, or merging rows; changing `position_no`; a per-row pool or tier edit.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — new behavior, replaces nothing.` The bulk replace, `editSet`, `removeSet` and
`repriceRow` all keep their current contracts byte-for-byte; the Row names panel keeps its
existing draft-and-bulk-save behavior and **gains** a per-row control beside it.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Renaming onto a label another row already carries silently **merges** two physical rows into one on the tourist map, the price rail and the pricing tab (they all `groupSetsByRow`). The DB constraint does **not** catch it when the two rows' `position_no` ranges don't overlap — which is the common case. | high | high | Probe before the write: refuse with the new `SetRejection.ROW_NAME_TAKEN` → `409` if any set outside the source row carries the target label. Pinned by AC-2 at both the service and the IT level. | plan author | closed — `VenueRowRenameIT.refusesANameAnotherRowAlreadyCarries` green, with disjoint position numbers so the UNIQUE index alone would have let the merge through |
| R-2 | The rename is the **first** path that can change a row's name while sold bookings exist. A guest whose confirmation mail says "Row B" will see "Back row" in their booking view and in any resent confirmation. | high | med | **Accepted, deliberately** (maintainer decision at the intake grill, 2026-08-20): a venue renaming a row is renaming the physical row, so signage moves with it and the live read is the truthful one; the guest's row+position pair still addresses the same sunbeds. `row_label` is stored on `set_position` only — verified across every migration — so there is nothing to snapshot and no divergence to reconcile. Recorded in `RESPONSIBILITIES.md` §`venue` at phase 3. | maintainer | accepted |
| R-3 | Probe-then-write race: `addSet` does not take the venue row lock, so it can insert a set carrying the target label between the duplicate probe and the `UPDATE`, and `set_position_cell_uniq` then surfaces as a `500` rather than the honest `409`. | low | low | **Accepted, mirroring the existing posture** — `addSet` itself probes with `findConflict` then relies on the same constraint as "the hard backstop" (`EditBeachMap` javadoc). Both writers are the same operator's console on the same venue; the window is one statement wide. If it ever bites, the fix is to map `DuplicateKeyException` to `ROW_NAME_TAKEN` in the adapter — noted here so a future session doesn't re-derive it. | plan author | accepted |
| R-4 | The rename shares `set_version` with the reprice and the bulk replace, so a rename racing either loses the optimistic race. | med | low | Intended: the shared token is what stops a replace and a rename off the same value from both winning. `set_version` is advanced **only** after a successful rename, so a rejected one leaves the acting tab's next write valid. Pinned by AC-4/AC-5. | plan author | closed — `VenueRowRenameIT.refusesAStaleRename` green |
| R-5 | Per-venue authorization (BOLA, invariant #13) — a new `/api/venues/{venueId}/**` surface. | low | high | `ownership.assertOwns` is the **first** statement of `VenueAdminService#renameRow`, before `venueExists` and before any read, exactly as the other five beach-map writes do; the controller performs no check of its own. Pinned by AC-6 + `CrossVenueDenialIT`. | plan author | closed — `VenueRowRenameIT` + `CrossVenueDenialIT.rowRenameByNonOwnerIs403` green |
| R-6 | WCAG 2.4.3 stranded focus: a per-row save button disabled by the flag its own click sets blurs to `<body>` for the whole request — the guard's BUSY-1 shape, red in CI via `scripts/check-focus-posture.mjs`. | med | med | Use `[appBusy]="savingRow() === y"` (`shared/busy-action.ts`), never `[disabled]`; it announces `aria-disabled` and consumes the activating click without moving focus. The row-name `<input>` keeps its draft-only `(input)` handler, so BUSY-2 does not apply. | plan author | closed — `check-focus-posture.mjs --diff origin/main` clean |
| R-7 | The Row names panel renders only in the layout tab's **bulk** branch (`@else` of `@if (mode() === 'sets')`), and a trading venue defaults to `sets` mode — so the rename could read as unreachable. | med | low | The mode toggle itself is free; only the bulk **Save** is refused. Bulk mode seeds `rowNames` from the loaded sets, so the panel shows real current names. Copy in the panel names the per-row save as the way to rename on a locked venue; AC-8's e2e drives exactly that path (locked venue → toggle → rename → 204). | plan author | open |

## Open questions / Assumptions

*(empty — all three intake-grill questions were answered by the maintainer before phase 0.)*

### Resolved

- **Row-scoped endpoint vs. widening `SetPlacement.disturbedBy`** (the issue's own "worth
  deciding first") — **resolved: row-scoped endpoint.** Maintainer decision, 2026-08-20.
  Rationale in **Architecture** above.
- **Which console surface carries the rename** — **resolved: the layout tab's Row names
  panel**, per-row save, independent of the bulk Save. Maintainer decision, 2026-08-20.
  The pricing tab is a Non-goal.
- **The sold-booking consequence** — **resolved: accept, live everywhere.** Maintainer
  decision, 2026-08-20. Recorded as R-2.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** **none.** The rename writes one
  column of `set_position` and nothing else. It neither creates, moves, nor releases a hold.
- **Uniqueness guarantee:** unchanged — `availability`'s `UNIQUE(set_id, booking_date)`
  is untouched, and set ids are untouched, so every existing hold keeps pointing at the same
  set row it pointed at before.
- **Concurrency strategy:** `lockAndReadSetVersion(venueId)` takes the venue row's
  `FOR UPDATE` and compares the caller's `expectedVersion` **before** the `UPDATE` — the
  same token and the same lock order (venue row before its set rows) that `repriceRow` and
  `replaceLayout` use, so no new deadlock edge is introduced. `set_version` advances only
  after a successful rename.
- **No claim probe, and why that is safe:** the three existing writes probe claims because
  they destroy or move what a claim depends on — `replaceLayout` deletes sets, `removeSet`
  deletes one, `editSet` can repool or reposition one. A rename changes **none** of
  `id`, `pool`, `position_no`, `grid_x`, `grid_y`, so no hold can be stranded and no guest
  re-seated. This is the identical argument `repriceRow` already makes and
  `RESPONSIBILITIES.md` §`venue` already records for price and tier.
- **Pool rule (invariant #3):** unaffected — `pool` is not written, and
  `SetBookingFacts#poolForClaim` reads the same rows under the same `FOR KEY SHARE` lock.
  A rename cannot move a set between the online and walk-in pools.
- **Cutoff rule (invariant #4):** not in scope — the rename has no date and no sale.
- **Pinning test:** `VenueRowRenameIT.renamesARowOnAVenueThatHasSold` asserts the booking,
  its `set_id` and the set's `availability` row are byte-identical after the rename;
  `VenueRepriceConcurrencyIT` is the existing template if a concurrency IT is added for R-4.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `BeachMap` | `venue`'s Job line owns "the beach map / layout, set positions" — a row's name is layout display data stored on `set_position`, the table `venue` is the only writer of. |
| M-2 | `operator` | existing (consumed, unchanged) | `Operator` | Consulted for the ownership answer via its existing `api/` port (invariant #13). No new grant: `venue` already lists `operator::api` + `::vocabulary`. |

**Cross-module named interfaces (`api/` ports)**

`N/A — no published surface changes.` `EditBeachMap` is a driving port **internal to
`venue`** (REST-only caller), so it lives in `application`, not `api/` — `renameRow` joins
it there. `SetRejection` likewise stays in `application`: no other module ever sees the
outcome, so publishing it would widen the surface for nothing. Nothing is added to
`venue.api`, `venue.vocabulary`, `venue.events` or `venue.spi`, and no
`allowedDependencies` entry changes — `ModularityTests` and
`PublishedSurfacePlacementArchitectureTests` should pass untouched.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published or consumed.` A rename is display data with no cross-module
consequence: `payout` needs the amount, `notification` reads mail facts live at send time,
`booking` and `availability` key on `set_id`. The five-event inventory in `CLAUDE.md` is
unchanged — this slice must **not** make it six.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Rename one beach-map row (write `set_position.row_label` for every set in a row) | `venue` | `venue` **Job**: "the beach map / layout, set positions… pricing". Not on any other module's list; `availability`'s Not-My-Job explicitly leaves the static layout to `venue` ("I own the static layout; it owns the per-date state"). |
| Decide whether the rename is refused because someone is owed the spot | `venue` | Same bullet as the existing locks — `venue` asks the question and `booking` answers *which statuses are live* via `BookingPresence`. Here the answer is that **no probe is needed at all**, so the slice consults neither `booking` nor `availability`. |
| Refuse a label another row already carries | `venue` | Layout integrity is `venue`'s, exactly like `CELL_TAKEN` / `DUPLICATE_POSITION` — the same class of pre-check the module already performs in `findConflict`. |
| Verify the acting operator owns the venue | `operator` (answer) / `venue` (enforcement point) | `operator` **Job**: "the operator↔venue ownership mapping"; `venue`'s Not-My-Job: "Deciding *which* venues an operator owns → `operator`". `venue` calls `VenueOwnership.assertOwns` in its application service — the enforcement location invariant #13 requires. |
| Show the renamed row to a guest holding a booking | *(no module changes)* | Already live: booking views and mails join `set_position` at read time through `venue.api.SetBookingFacts`, which is deliberately unfenced for sold-booking paths. R-2's consequence needs **no code** — which is the evidence that the label is display data. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, written, charged or refunded; no price
column is touched (that is `repriceRow`'s job and it is untouched); the payout ledger is
not reached. A booking's charge was snapshotted at reserve time, so a rename cannot alter
what anyone pays or what a venue is owed.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` | existing | standalone component | New signals: `storedRowNames` (the labels as saved, seeded on load), `savingRow` (index or `null`), `savedRowName`, `rowNameError`. `renameRow(y)` async method. | none — a plain `<input>` draft, committed by a button |
| FE-2 | `operator/layout-editor.html` | existing | template | Per-row save button inside the existing Row names panel, rendered only when `storedRowNames()[y]` exists and its draft differs | — |
| FE-3 | `operator/operator-console.service.ts` | existing | `@Service` | `renameRow(venueId, rowLabel, newLabel, expectedVersion): Observable<void>` + `rowNameErrorOf(error)` | — |
| FE-4 | `operator/operator-console.model.ts` | existing | types | `RowNameErrorCode` union incl. `ROW_NAME_TAKEN` | — |
| FE-5 | `operator/layout-editor.spec.ts` · `.a11y.spec.ts` · `.contrast.spec.ts` | existing | Vitest specs | AC-8/9/10 + axe over the panel with the new control | — |
| FE-6 | `frontend/e2e/layout-editor.e2e.ts` | existing | Playwright (mocked CI suite) | AC-8 end-to-end on a venue whose bulk save is locked | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signals + `computed()`, no
`ngClass`/`ngStyle` (`class` bindings only), Tailwind utilities with no new `.scss`,
`[appTouchTarget]` on the new button, and `[appBusy]` — never `[disabled]` — for the
in-flight lock (R-6). Confirmed against the angular-cli MCP `get_best_practices` for this
workspace (Angular 22, Vitest). No deviations.

**Behavior on success:** advance `loadedSetVersion` by one (the conditional write bumped
`set_version`), write the new label into `storedRowNames[y]`, and call `venueMap.reset()`
so the console's shared snapshot and the pricing tab re-read. On `STALE_WRITE`, delegate to
the editor's existing `errorCode`/Reload banner rather than adding a second recovery
surface (AC-10).

## FE↔BE contract

- **New endpoint:** `PUT /api/venues/{venueId}/rows/{rowLabel}/name`
  - Request body: `{ "newLabel": string, "expectedVersion": number }`
  - `204 No Content` on success.
  - `400 INVALID_REQUEST` — missing `expectedVersion`, blank or over-long `newLabel`.
  - `403` — operator does not own the venue (invariant #13).
  - `404 NO_SUCH_VENUE` / `404 NO_SUCH_ROW`.
  - `409 STALE_WRITE` / `409 ROW_NAME_TAKEN` (new `code`).
  - Errors are RFC-7807 `ProblemDetail` from the standing `ApiProblem` factory — no new
    `@RestControllerAdvice`, no per-controller `@ExceptionHandler` (§6b).
- **Path label encoding:** the source label rides the path and is `encodeURIComponent`-ed by
  the client, exactly as `repriceRow` already does — it can now be an arbitrary ≤ 40
  code-point string, spaces and Unicode included.
- **Client typing:** hand-written typed method on `OperatorConsoleService`; no `as any`.
- **Money/date on the wire:** `N/A` — neither appears in this contract.

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** Phase 3 — the mocked e2e spec, then patch `RESPONSIBILITIES.md` §`venue`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend inner hexagon (command, outcome, port, service, adapter) | ✅ | *(this commit)* |
| 1 — REST edge + integration tests | ✅ | *(this commit)* |
| 2 — Layout-editor per-row rename (Angular) | ✅ | *(this commit)* |
| 3 — Mocked e2e + substrate docs | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| *(none yet)* | | | |

---

## File structure

- `docs/plans/beach-map-row-rename.md` — this plan.
- `platform/src/main/java/ai/riviera/platform/venue/application/RowNameCommand.java` — new; the validated rename intent.
- `platform/src/main/java/ai/riviera/platform/venue/application/SetRejection.java` — add `ROW_NAME_TAKEN`.
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — add `renameRow`.
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — implement `renameRow`.
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — add `rowNameTaken` + `renameRow`.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the two statements.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/RowNameRequest.java` — new request DTO.
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — the endpoint + the new `SetRejection` switch arm.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — role-gate the new `PUT` path (found by `VenueWriteRoleGateTest`, not anticipated in this list).
- `platform/src/test/java/ai/riviera/platform/venue/application/RowNameCommandTest.java` — new.
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — rename cases.
- `platform/src/test/java/ai/riviera/platform/venue/VenueRowRenameIT.java` — new.
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stub the new port method.
- `platform/src/test/java/ai/riviera/platform/VenueWriteRoleGateTest.java` — role gate for the new path.
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — cross-venue probe.
- `frontend/src/app/operator/operator-console.model.ts` — `RowNameErrorCode`.
- `frontend/src/app/operator/operator-console.service.ts` — `renameRow` + `rowNameErrorOf`.
- `frontend/src/app/operator/layout-editor.ts|.html` — the per-row rename control.
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-8/9/10.
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — axe over the panel.
- `frontend/e2e/layout-editor.e2e.ts` — AC-8 end-to-end.
- `RESPONSIBILITIES.md` — §`venue` layout-lock bullet gains the rename.

> Run `node scripts/check-plan-file-structure.mjs --diff origin/main` before every push —
> **with this plan doc staged or committed**, or the guard short-circuits and passes.

---

## Phase 0 — Backend inner hexagon (command, outcome, port, service, adapter)

**Files:** Create `RowNameCommand.java`, `RowNameCommandTest.java` · Modify
`SetRejection.java`, `EditBeachMap.java`, `VenueAdminService.java`, `Venues.java`,
`JdbcVenues.java`, `VenueAdminController.java`, `WebSliceStubs.java` · Test
`VenueAdminServiceTest.java`

> **Scope note (recorded during execution):** the plan split the JDBC adapter into phase 1,
> but the compiler does not allow it — adding a method to the `Venues` interface breaks
> `JdbcVenues`, and adding `ROW_NAME_TAKEN` to `SetRejection` breaks the controller's
> exhaustive `switch`. Both land here, fully implemented rather than stubbed; phase 1 is
> the REST endpoint and the integration tests.

- [ ] **Step 1: Write the failing tests** — `RowNameCommandTest` (length bound at 40 code
  points, blank rejection) and, in `VenueAdminServiceTest`, the four service outcomes:
  ownership-first, `STALE_WRITE` before any probe, `ROW_NAME_TAKEN`, `NO_SUCH_ROW` with
  `set_version` untouched, and the same-label no-op (AC-3).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*RowNameCommandTest*" --tests "*VenueAdminServiceTest*"` → FAIL (symbol not found).
- [ ] **Step 3: Minimal implementation** — the record, the enum constant, the port method,
  the service method in `repriceRow`'s exact order: `assertOwns` → `venueExists` →
  `lockAndReadSetVersion` → `rowNameTaken` → `renameRow` → `incrementSetVersion`.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: *every `EditBeachMap` write that
  guards on `set_version`*; enumerate with `grep -n "lockAndReadSetVersion" platform/src/main/java -r`;
  judge whether each advances the token only on success.
- [ ] **Step 6: Commit** — `git commit -m "Add a row-scoped beach-map rename to the venue service (#726)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — REST edge + integration tests

**Files:** Create `RowNameRequest.java`, `VenueRowRenameIT.java` · Modify
`VenueAdminController.java`, `SecurityConfig.java`, `VenueWriteRoleGateTest.java`,
`CrossVenueDenialIT.java`

> **Found during execution:** `SecurityConfig` gates the venue writes **per verb and path**,
> not by namespace, so the new `PUT` fell straight through to the controller. Caught by
> `VenueWriteRoleGateTest`'s new case (it reached the mock and NPE'd instead of being refused
> at the filter chain). `EndpointProbes` needed no edit — it discovers mapped endpoints and
> already samples `rowLabel`.

- [ ] **Step 1: Write the failing test** — `VenueRowRenameIT` covering AC-1, AC-2, AC-4,
  AC-5, AC-6, plus the over-long-label `400`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueRowRenameIT*"` → FAIL.
- [ ] **Step 3: Minimal implementation** — the `EXISTS` probe (self-rename folded into the
  predicate so AC-3 holds), the single-column `UPDATE`, the `@PutMapping`, and the new
  `ROW_NAME_TAKEN` arm in the controller's exhaustive `error(SetRejection)` switch.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueRowRename*" --tests "*VenueAdminControllerIT*" --tests "*CrossVenueDenialIT*"` → PASS.
- [ ] **Step 5: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacement*" --tests "*ErrorContractArchitectureTests*"` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "Expose the row rename over the venue admin API (#726)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Layout-editor per-row rename (Angular)

**Files:** Modify `operator-console.model.ts`, `operator-console.service.ts`,
`layout-editor.ts`, `layout-editor.html`, `layout-editor.spec.ts`,
`layout-editor.a11y.spec.ts`

- [ ] **Step 1: Write the failing specs** — AC-8, AC-9, AC-10 in `layout-editor.spec.ts`;
  extend the a11y spec to run axe with the panel's new control present.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/operator/layout-editor.spec.ts` → FAIL.
- [ ] **Step 3: Minimal implementation** — the service method, the error-code union and
  mapper, the four signals, `renameRow(y)`, and the button (`[appBusy]`, `[appTouchTarget]`,
  an `aria-label` naming the row, `data-testid="layout-row-name-save"`) shown whenever the row
  has a stored label.

> **Found during execution:** the button could not go inside the existing `<label>` — a
> `<button>` is a labelable element, so a label containing one may label the button instead of
> the row-name input. The row is now a flex `<div>` wrapping the `<label>` (input only) and the
> button as siblings; the new axe case in `layout-editor.a11y.spec.ts` is what pins it. The
> "only when the draft differs" condition was dropped: a control that appears and disappears as
> you type is worse than one that is always there for a stored row.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/operator/` then `npm run lint && npm run format:check` → PASS.
- [ ] **Step 5: Guards** — `node scripts/check-focus-posture.mjs --diff origin/main`,
  `node scripts/check-touch-target.mjs --diff origin/main`,
  `node scripts/check-inline-comments.mjs --diff origin/main` → all clean.
- [ ] **Step 6: Commit** — `git commit -m "Let the layout tab rename one row without the bulk save (#726)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Mocked e2e + substrate docs

**Files:** Modify `frontend/e2e/layout-editor.e2e.ts`, `RESPONSIBILITIES.md`

- [ ] **Step 1: Write the failing e2e** — a venue whose bulk save answers `LAYOUT_IN_USE`,
  toggled to bulk mode; rename row `B`; assert the PUT path, body and the saved state (AC-8).
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- layout-editor` → FAIL.
- [ ] **Step 3: Implementation** — wire the mock route; patch `RESPONSIBILITIES.md` §`venue`
  so the layout-lock bullet reads "price, tier **and the row name** stay editable on a
  claimed set", with the row-scoped rename and R-2's accepted consequence named.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Docs freshness** — run `riviera-docs-freshness` over `origin/main...HEAD`;
  counting sweep for anything that says "the three layout writes" or similar, now four.
- [ ] **Step 6: Commit** — `git commit -m "Cover the row rename end-to-end and record it in the venue contract (#726)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-20 | Phase 1 — new venue-scoped write verb | Every operator-only `/api/venues/**` write path, judged on whether `SecurityConfig` role-gates it (mechanism: it is a `requestMatchers(HttpMethod.…, …)` entry, not a namespace rule) | `grep -n "requestMatchers(HttpMethod" platform/src/main/java/ai/riviera/platform/SecurityConfig.java` | 1 gap — the new `PUT …/rows/*/name` | Gated it beside `ROW_PRICE_PATH`. The standing `EndpointRoleGateCoverageTest` is the mechanical net for this class; it and `VenueWriteRoleGateTest` are both green. |
| 2026-08-20 | Phase 0 — new `set_version`-guarded write | Every application-service write that guards on the venue's `set_version` token (mechanism: it calls `Venues#lockAndReadSetVersion`), judged on whether it advances the token **only** after the write succeeds | `grep -rn "lockAndReadSetVersion" platform/src/main/java --include=*.java` | 3 call sites — `repriceRow`, `renameRow`, `replaceLayout` | No fix needed: all three advance only on success, so a rejected write leaves the acting tab's retry valid. Pattern held; the new site was written to match. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** Run `./gradlew test --tests "*VenueRowRenameIT*" --tests "*RowNameCommandTest*" --tests "*VenueAdminServiceTest*"` → all green.
- [ ] **AC-8..AC-10:** Run `npx vitest run src/app/operator/layout-editor.spec.ts` and `npm run test:e2e:a11y -- layout-editor` → all green.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; the no-claim-probe argument holds (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — neither is written.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new published surface, no sixth event (invariant #11).
- [ ] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: no time reasoning in scope (invariant #6).
- [ ] Booking codes unguessable — untouched (invariant #7).
- [ ] No schema change, so no Flyway migration; the V43 CHECK and V2 UNIQUE still back the bound (invariant #12).
- [ ] Per-venue ownership asserted in the application service (invariant #13); `CrossVenueDenialIT` covers the new path.
- [ ] **Frontend** standards met; `[appBusy]` not `[disabled]`; `[appTouchTarget]` present; no new `.scss`; no `as any`.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean, with this doc committed.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
