# Multi-day stays 1/12 — a remodel settles per claim Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** A remodel commit whose fresh picture holds a blocked claim no longer refuses the lot: it
moves, refunds, releases and declines every claim it can, keeps each blocked claim where it is with
its set left exactly as stored, receipts the kept claims with their reason, and refuses only when
the painted layout gives a kept set's label to another set.

**Architecture:** The gate answer grows from a boolean to a verdict: `booking` settles every claim
inside `venue`'s transaction and answers the kept claims; the edge hands `venue` the kept sets'
ids through `RemodelGate`; `venue` writes the layout with those sets untouched (a removed one
stays, a renumbered one keeps its number, tier, pool and price), excludes them from the live-claim
probe, and refuses with nothing written when a submitted set wants a kept set's `(row, position)`.
Each module keeps its rule (ADR-0020 §4): which claims are kept is `booking`'s, how a kept set
survives the save is `venue`'s, the edge maps. Every kept claim keeps every `(set, date)` row it
already holds, so invariant #2 needs no new primitive.

**Persistence:** JDBC only (invariant #1). New table `remodel_receipt_kept` (one line per kept
claim: booking, day, set snapshot by label, reason), migration `V62__remodel_receipt_kept.sql`.
No other table changes.

**Source of intent:** GitHub issue #1199 (epic #1096); `docs/architecture/multi-day-stays.md` § D9
and story 41.

**Skills consulted:** `riviera-sdlc` (intake gate: the issue's premise is API-true but
UI-unreachable — the editor never sends a blocked picture, so the slice must make blocked pictures
committable; V62 free on `main` and unclaimed by the open PRs, all dependabot's; siblings #1200 and
#1201 closed and counted on the epic; six decisions put to the user, below) · `riviera-plan-doc`
(forced the module-ownership table, the displaced-label refusal into the risk register and the
seam list) · `tdd` (each phase red-green at the driving port; the existing remodel ITs are the
equivalence oracle for every non-blocked picture) · `riviera-review-overlay` (ran at
ready-for-review with the code-review plugin over `cf808acd..3f4fe9d5`; RV-PROC-1 added
`riviera-local-debug` to this line, RV-PROC-2 sharpened the glossary's frozen zone) ·
`riviera-docs-freshness` (**ran** at close-out, see the Findings register) ·
`riviera-local-debug` (JDK 25 at `/opt/jdk-25`, scoped test runs, the hook's dockerd; the
clone was unshallowed before the guards and the review range) · `grilling` (Q1 venue keeps the
set · Q2 frontend in this slice · Q3 a `remodel_receipt_kept` table · Q4 staff holds stay
`STALE_PREVIEW` · Q5 a displaced kept label refuses the save · Q6 a kept set is wholly untouched) ·
`postgres` (identity PK, `TEXT` + `CHECK` for the reason, FK on `receipt_id` and `booking_id` each
indexed, `set_id` recorded without an FK as the outcome table does) · `riviera-modulith` (the
verdict is `venue.vocabulary`, published beside the port it answers; `RemodelCommit.Refused`
retires from `booking.vocabulary`; no new grant) · `riviera-java-conventions` (sealed verdict,
records, values not exceptions for the displaced case; Javadoc carries the contract) ·
`codebase-design` (the kept-set rule sits behind `LayoutDiff#keeping`/`#displaced`, one seam the
writer and its test cross; no new port) · `domain-modeling` (glossary gains **kept claim** and
**kept set**; no ADR — reversible, and ADR-0020 already holds the composition) · `riviera-frontend`
(`operator/` only: model, two panels, editor copy; no new cross-feature edge) · `angular-developer`
+ angular-cli MCP (at phase 4) · `riviera-tailwind` (at phase 4: no new token, existing text
classes) · `playwright-cli` (at phase 4: one mocked e2e case in `frontend/e2e/layout-editor.e2e.ts`)

**Branch:** `claude/sdlc-1199-1yjxar` (cloud session's designated branch, stands in for
`feature/remodel-per-claim`)

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a layout that removes sets A1 and A2, a `CONFIRMED` claim on A1 for tomorrow
  (frozen) and a `CONFIRMED` claim on A2 in ten days with A3 free, when the operator commits the
  previewed picture, then A2's booking is re-seated on A3 with `BookingMoved` published, A1's
  booking keeps A1 and its `(A1, tomorrow)` row, A1 stays on the active map at its label, A2 is
  retired, the token is spent once and the answer is `200` with one move and one kept line
  (`FROZEN`). *Seam:* `POST /api/venues/{id}/beach-map/commit` over `RemodelClaims#commit` +
  `BeachMapRemodel#commit` · *Pinned by:*
  `RemodelCommitIT.aBlockedClaimIsKeptWithItsSetWhileTheRestCommits`
- [x] **AC-2:** Given a blocked claim on A1 and a layout that removes A1 and paints a new set
  labelled A1 elsewhere, when the operator commits, then the answer is `409 REMODEL_REFUSED` with
  the fresh picture whose `keep` names A1, and nothing is written: no move, no retire, no receipt,
  token unspent. *Seam:* the same route · *Pinned by:*
  `RemodelCommitIT.aLayoutThatDisplacesAKeptSetsLabelIsRefusedAndWritesNothing`
- [x] **AC-3:** Given a fresh picture with a `Blocked` claim covered by the token, when
  `RemodelClaims#commit` runs, then it answers `Applied` with the blocked claim among the settled
  claims, touches no availability row and publishes no event for it, and the receipt stored carries
  one kept line with the reason. *Seam:* `RemodelClaims#commit` · *Pinned by:*
  `RemodelClaimsServiceTest.aBlockedClaimIsKeptAndReceiptedWhileTheRestSettles`
- [x] **AC-4:** Given the gate answers `Proceed(kept = [A1])` on a layout that removes A1, when
  the writer runs, then A1 is neither retired nor deleted nor probed, the rest of the diff is
  written and the token advanced; given the layout instead renumbers A1, A1's stored row is not
  updated. *Seam:* `LayoutWriter#write` (the `venue` module's one bulk write, behind
  `BeachMapRemodel#commit`) · *Pinned by:*
  `LayoutWriterTest.aKeptSetIsLeftAsStoredAndSkippedByTheProbe`,
  `LayoutWriterTest.aKeptRenumberedSetKeepsItsStoredRow`
- [x] **AC-5:** Given the gate answers `Proceed(kept = [A1])` and a submitted set wants A1's
  stored `(row, position)`, when the writer runs, then it answers `KeptSetsDisplaced([A1])` and
  writes nothing. *Seam:* `LayoutWriter#write` · *Pinned by:*
  `LayoutWriterTest.aSubmittedSetOnAKeptSetsLabelRefusesTheWholeWrite`,
  `LayoutDiffTest.keepingDropsTheKeptSetsFromRemovalsAndUpdatesAndDisplacedNamesTheClashes`
- [x] **AC-6:** Given a partial settlement (a frozen claim on A1 kept, a far-out claim on A1 moving
  to A2) racing an online reserve of `(A2, day)`, when both run, then exactly one online claim holds
  `(A2, day)`, the kept claim's `(A1, tomorrow)` row is intact and A1 is still active, in both
  orders. *Seam:* `RemodelCommitService#commit` vs `AvailabilityClaim#claim` · *Pinned by:*
  `MoveVsReserveConcurrencyIT.aPartialSettlementNeverDoubleClaimsAndKeepsTheKeptRow`
- [x] **AC-7:** Given a receipt with a kept line, when the owner reads it, then the kept line rides
  `kept[]` with booking id, day, spot and reason, and `endedByRemodel` is false for that booking.
  *Seam:* `GET /api/venues/{id}/remodels/{receiptId}` + `RemodelReceipts` · *Pinned by:*
  `RemodelReceiptIT.readsAKeptLineWithItsReason`,
  `JdbcRemodelReceiptsIT.keptLinesReadBackAndNeverCountAsEnded`
- [x] **AC-8:** Given V61 with receipts, when V62 runs, then `remodel_receipt_kept` refuses an
  unknown reason and an orphan receipt. *Seam:* Flyway + the table · *Pinned by:*
  `RemodelCommitMigrationIT.theKeptTableHoldsItsShape`
- [x] **AC-9:** Given a preview with blocks and no staff holds, when the editor renders it, then
  Save is offered, the copy says the blocked sets stay on the map, the Save label counts the kept
  bookings; given staff holds, Back alone as today; given a commit `200` with kept lines, the
  receipt panel lists them under "Kept in place". *Seam:* `RemodelPreviewPanel` /
  `RemodelReceiptPanel` inputs · *Pinned by:*
  `remodel-preview-panel.spec.ts` "a picture with blocks alone is committable and says the sets
  stay", `remodel-receipt-panel.spec.ts` "lists the kept lines with their reason", e2e "a blocked
  picture commits: the kept set stays on the map and the receipt lists it (#1199)"

## Non-goals

- Splitting a stay per segment (story 41 proper) — this slice keeps a claim whole.
- Moving a frozen claim (D9 names it; the issue's AC keeps "never moved").
- Pinning staff walk-in holds (Q4): a held set still answers `409 STALE_PREVIEW`; follow-up issue
  filed at close-out if the user wants it.
- Re-seating other claims on a kept set differently: a claim that can move off a kept set still
  moves, as the preview showed — the operator painted that set away.

## Behavior-parity ledger (retirement / replacement slices only)

The commit's `Refused` answer is replaced, so every behaviour of the old refusal is accounted for.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A `Blocked` claim in the fresh picture → `409 REMODEL_REFUSED`, nothing written | changed | The claim is kept, the rest settles, `200` with `kept[]`; `REMODEL_REFUSED` now means a kept set's label is displaced (AC-2) |
| `REMODEL_REFUSED` carries the fresh picture + token | preserved | Same problem shape; the editor's re-render path is unchanged |
| A `Blocked` claim not in the token → `409 STALE_PREVIEW` | preserved | Token check runs first, unchanged |
| A staff hold on a disturbed set → `409 STALE_PREVIEW` | preserved | Q4 |
| Editor: a picture with blocks offers Back only | changed | Save offered; blocks-only pictures commit; holds still Back-only |
| Editor copy "Keep X on the map to save" | changed | For blocks: "X stays on the map"; for holds: unchanged |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A kept set's label clashes with a submitted set → `set_position_cell_uniq` violation as a raw 500 | M | H | `LayoutDiff#displaced` checks every submitted command against every kept set's stored `(row, position)` before any write → `KeptSetsDisplaced`, transaction rolls back (AC-5) | agent | closed — `e48259c` |
| R-2 | The probe (`LiveClaims#locksOn`) still sees the kept set's live claim → `SETS_IN_USE` after the gate | H | H | Probe runs on `disturbed − kept` (AC-4) | agent | closed — `e48259c` |
| R-3 | Race (#2): a reserve on the move candidate during a partial settlement | L | H | Unchanged mechanism — candidate claim is `ON CONFLICT`, venue set rows `FOR UPDATE`; kept rows are never touched; pinned by AC-6 | agent | closed — `8d8a86e` |
| R-4 | `endedByRemodel` counts a kept booking as venue-ended → the cancellation mail lies | M | M | Separate table (Q3); `endedByRemodel` reads `remodel_receipt_outcome` only; pinned by AC-7 | agent | closed — `e2a643a` |
| R-5 | Published surface change: `RemodelGate` and `RemodelCommit` shapes; `WebSliceStubs`, `PayoutModuleTest`, `SpanReleaseIT`, `BeachMapEditService` compile against them | H | L | One `grep -rn "RemodelGate\|RemodelCommit\.\|proceed(" platform/src` sweep before phase 2 ends; structural net run | agent | closed — sweep in the audit log, net green at `e48259c` |
| R-6 | BOLA (#13): no new venue-scoped surface; every port still asserts ownership first | L | H | Unchanged; `CrossVenueDenialIT` untouched | agent | closed — no new route |
| R-7 | Frontend e2e mocks lacking `kept` crash the receipt panel | M | M | Every mocked receipt gains `kept: []`; TS type makes the fixtures fail to compile without it | agent | closed — `63ac8a8` |
| R-8 | Flyway `V62` claimed by a racing PR | L | L | Free on `main` @ `cf808ac`, open PRs dependabot-only; the branch merging second renumbers | agent | closed — `main` still at `cf808ac` at close-out, no other V62 |

## Open questions / Assumptions

- **Assumption:** a claim that can move off a kept set still moves (Non-goals, last bullet) — the
  operator painted the set away and confirmed the move on the preview; keeping it too would add a
  second classification pass for no product ask. — *Owner:* agent · *Resolves by:* the PR review;
  stated in `RESPONSIBILITIES.md` §booking so a reviewer sees it.

### Resolved

- Q1–Q6 above, decided with the user at intake (this session, 2026-09-25).

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** the remodel move (claim on the
  candidate for every day of the span, then release the old rows), the refund/release/decline legs
  (release every day). A kept claim writes nothing — its rows stay as they are.
- **Uniqueness guarantee:** `UNIQUE (set_id, booking_date)` on `set_availability`.
- **Concurrency strategy:** unchanged — `venue` holds `FOR UPDATE` on every active set row of the
  venue for the whole commit; the move's claim is `INSERT … ON CONFLICT DO NOTHING`, a lost
  candidate throws and rolls the whole unit back. Partial settlement adds no write path.
- **Pool rule (#3):** unchanged — candidates come from `SetBookingFacts#freeOnlineSetsOn`.
- **Cutoff rule (#4):** unchanged — the zones are `RemodelZones`', sales close plays no role.
- **Pinning test:** `MoveVsReserveConcurrencyIT.aPartialSettlementNeverDoubleClaimsAndKeepsTheKeptRow`

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `remodel_receipt_kept` (new), plus its existing receipt tables | Which claim is kept and why is the remodel classification's answer; the receipt is `booking`'s (RESPONSIBILITIES §booking) |
| M-2 | `venue` | existing | `set_position` | How a kept set survives the bulk write is the layout write's rule (§venue) |
| M-3 | root (edge) | existing | none | Maps the kept claims onto the gate verdict and the wire (ADR-0020 §4) |

**Cross-module `api/` ports**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `RemodelGate#proceed` → `GateVerdict` (was `boolean`) | `venue.vocabulary.GateVerdict` (`Proceed(List<SetId> kept)` / `Decline`), `LayoutCommitOutcome.KeptSetsDisplaced` | root (`RemodelCommitService`), `venue` itself (`BeachMapEditService`'s always-proceed gate) |
| NI-2 | `booking.api` | `RemodelClaims#commit` → `RemodelCommit` loses `Refused`; `Applied(receiptId, committedAt, settled)` | `booking.vocabulary.RemodelCommit` | root |

**Domain events (id-based payloads)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `BookingMoved` | `booking` (per moved claim only — unchanged) | booking, venue, from/to set, date | `notification` | async | `RemodelCommitIT` AC-1 (kept booking has no `moved_at`) |

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| Deciding a claim is kept (`Blocked` → kept, reason) and receipting it | `booking` | §booking Job: "remodel claim classification + receipt"; `venue` Not-My-Job: never learns what a booking is |
| Leaving a kept set as stored, excluding it from the probe, refusing a displaced label | `venue` | §venue Job: the beach map and the one bulk write; `booking` never writes `set_position` |
| Turning kept claims into kept set ids for the gate; mapping `KeptSetsDisplaced` to `REMODEL_REFUSED` | root | ADR-0020 §4: assembly, no rule |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope`: a kept claim moves no money; the refund/release/decline legs are
unchanged and keep their pinning tests (`RemodelCommitIT.commitsAMixedPictureAndReceiptsEveryOutcome`).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-console.model.ts` | existing | model | `RemodelReceiptKept`, `RemodelReceipt.kept`, `remodelPreviewIsCommittable` no longer excludes blocks | — |
| FE-2 | `operator/remodel-preview-panel.ts|.html` | existing | component | copy for a committable picture with blocks ("stay on the map"), Save label counts kept, blocks heading "Will stay put" | unchanged Signal Form |
| FE-3 | `operator/remodel-receipt-panel.ts` | existing | component | "Kept in place (n)" group, `committedText` counts kept | — |
| FE-4 | `frontend/e2e/layout-editor.e2e.ts` | existing | mocked e2e | one new case; every mocked receipt gains `kept: []` | — |

## FE↔BE contract

- **New/changed endpoints:** `POST /api/venues/{id}/beach-map/commit` `200` gains `kept[]`
  (`{bookingId, bookingDate, amount, from, reason}`, the preview's `BlockView` shape);
  `409 REMODEL_REFUSED` keeps its shape, new `detail` sentence; `GET /api/venues/{id}/remodels/{id}`
  gains `kept[]` (`{bookingId, bookingDate, from, reason}`).
- **Client typing:** hand-typed in `operator-console.model.ts`; never `as any`.
- **Money/date on the wire:** minor units + currency; ISO `LocalDate`.

## Execution status

**Stage pointer:** `merge close-out — CI + Sonar on the close-out push, then merge`

**Next action:** CI green and the Sonar list empty on this head → merge → close-out steps 1–3, 6–7. Merged via PR #1214.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V62 + kept lines in the receipt | ✅ | `e2a643a` |
| 1 — `booking` keeps instead of refusing | ✅ | `ce2b3fc` |
| 2 — `venue` gate verdict + kept sets | ✅ | `e48259c` |
| 3 — edge, wire, ITs, concurrency | ✅ | `8d8a86e` |
| 4 — frontend | ✅ | `63ac8a8` |
| 5 — docs, gates, close-out | ✅ | `a27dc2af` docs · `3f4fe9d5` Sonar · `a9d78169` freshness · `96d7cb71` review fixes · this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | Sonar (java:S1192) | `"SELECT "` literal three times in `JdbcRemodelReceipts` | fixed — `SELECT` constant |
| F-2 | Sonar (java:S1192) | `"reason"` column read duplicates `P_REASON` | fixed — reads the constant |
| F-3 | Sonar (typescript:S3358) | nested ternary in `keepSentence` | fixed — verb hoisted to a local |
| F-4 | docs-freshness 2b over `cf808acd..3f4fe9d5` | `JdbcRemodelReceipts` Javadoc counted "the two line readers"; the kept reader is the third | fixed — count dropped |
| F-5 | docs-freshness plan retirement | `docs/plans/multi-day-span.md` (merged via PR #1213) still in the tree; no citation outside `docs/plans/` | fixed — `git rm` in this PR |
| F-7 | review gate (prior-PR reviewer, PR #1052's focus finding) | `REMODEL_REFUSED` now carries a committable picture, so the editor focused Save and would resubmit the same paint | fixed — the panel's `displaced` input: Back alone, the paint-back sentence; editor spec + e2e |
| F-8 | review gate (prior-PR reviewer, PR #1051's copy finding) | the held branch's keep sentence named every `keep` set, blocked claims' included, though the save keeps those itself | fixed — names the held sets alone |
| F-9 | review gate (comment reviewer) | `RemodelPreviewResponse`/`RemodelPreviewAssembler` still worded `keep` as "a blocked preview says to keep" | fixed — reworded |
| F-10 | review gate (conventions reviewer, RV-BE-19) | `LayoutDiff#displaced` restates the label-uniqueness rule in Java | no change — the precedented pre-check for a typed answer (`LayoutCommand#duplicateWithin`); the index stays the backstop, now said in its Javadoc |
| F-11 | review gate (conventions reviewer, §6d budget) | touched type Javadocs over ~6 lines | no change — pre-existing length, "~" guideline |
| F-12 | CI (Repo hygiene on `96d7cb71`) | five review-fix paths missing from File structure | fixed — listed |
| F-6 | docs-freshness 2a/3 | zero stale present-tense facts in `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`, ADRs, skills, `docs/agents`; "five wire groups" and "the four remodel legs" still hold (a kept claim is a group, not a leg) | no action |

---

## File structure

- `docs/plans/remodel-per-claim.md` — this plan
- `docs/plans/multi-day-span.md` — retired (its PR #1213 merged)
- `platform/src/main/resources/db/migration/V62__remodel_receipt_kept.sql` — the kept-line table
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/ReceiptKept.java` — one kept line
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/{NewReceipt,RemodelReceipt,RemodelReceipts,RemodelClaimsService}.java` — kept lines; commit keeps instead of refusing
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceipts.java` — store/read kept lines
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelReceiptView.java` — `kept[]`
- `platform/src/main/java/ai/riviera/platform/booking/api/RemodelClaims.java` — commit contract
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/{RemodelCommit,RemodelOutcome,BlockReason}.java` — `Refused` retired; `Applied.settled`; kept wording
- `platform/src/main/java/ai/riviera/platform/venue/api/{RemodelGate,BeachMapRemodel}.java` — verdict contract
- `platform/src/main/java/ai/riviera/platform/venue/vocabulary/{GateVerdict,LayoutCommitOutcome}.java` — the verdict; `KeptSetsDisplaced`
- `platform/src/main/java/ai/riviera/platform/venue/application/{LayoutWriter,LayoutWrite,LayoutDiff,BeachMapRemodelService,BeachMapEditService}.java` — kept sets in the write
- `platform/src/main/java/ai/riviera/platform/{RemodelCommitService,RemodelCommitOutcome,RemodelCommitResponse,RemodelCommitController}.java` — verdict hand-off, `kept[]`, refusal sentence
- `platform/src/test/java/ai/riviera/platform/{RemodelCommitIT,RemodelReceiptIT,MoveVsReserveConcurrencyIT,WebSliceStubs}.java`
- `platform/src/test/java/ai/riviera/platform/booking/{RemodelCommitMigrationIT,SpanReleaseIT,FreeExitCancelIT}.java`
- `platform/src/test/java/ai/riviera/platform/notification/{BookingMovedMailIT,BookingCancellationMailIT}.java` — receipt constructors gain the kept list
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceiptsIT.java`
- `platform/src/test/java/ai/riviera/platform/booking/application/remodel/RemodelClaimsServiceTest.java`
- `platform/src/test/java/ai/riviera/platform/venue/application/{LayoutWriterTest,LayoutDiffTest,BeachMapRemodelServiceTest}.java`
- `platform/src/test/java/ai/riviera/platform/payout/PayoutModuleTest.java` — if the stubbed port shapes need it
- `frontend/src/app/operator/operator-console.model.ts` — kept type, committable rule
- `frontend/src/app/operator/remodel-preview-panel.{ts,html,spec.ts,fixtures.ts}` — copy + specs
- `frontend/src/app/operator/remodel-receipt-panel.{ts,spec.ts,fixtures.ts}` — kept group + specs
- `frontend/src/app/operator/operator-console.model.spec.ts` — the committable rule
- `frontend/src/app/operator/layout-editor.{ts,html,spec.ts}` — `REMODEL_REFUSED` re-renders as a displaced kept set (`previewDisplaced`), Back takes focus
- `platform/src/main/java/ai/riviera/platform/{RemodelPreviewResponse,RemodelPreviewAssembler}.java` — `keep` Javadoc: the sets that stay, kept by the save or by the operator
- `frontend/e2e/layout-editor.e2e.ts` — mocks gain `kept`; one new case
- `RESPONSIBILITIES.md`, `CONTEXT.md`, `docs/architecture/multi-day-stays.md` — the commit's rule, the glossary, D9 landed

---

## Phase 0 — V62 + kept lines in the receipt

**Files:** Create `V62__remodel_receipt_kept.sql`, `ReceiptKept.java` · Modify `NewReceipt`, `RemodelReceipt`, `RemodelReceipts`, `JdbcRemodelReceipts` · Test `RemodelCommitMigrationIT`, `JdbcRemodelReceiptsIT`

- [x] Red: `RemodelCommitMigrationIT.theKeptTableHoldsItsShape` (unknown reason and orphan receipt refused) and `JdbcRemodelReceiptsIT.keptLinesReadBackAndNeverCountAsEnded` — `./gradlew --console=plain test --tests "*RemodelCommitMigrationIT*" --tests "*JdbcRemodelReceiptsIT*"` → FAIL (compile / relation missing)
- [x] Green: migration + records + adapter; same command → PASS
- [x] Commit `Remodel receipts gain kept lines (#1199)`; Execution status.

## Phase 1 — `booking` keeps instead of refusing

**Files:** Modify `RemodelClaimsService`, `RemodelCommit`, `RemodelClaims` Javadoc · Test `RemodelClaimsServiceTest` (replace `blockedAndHeldPicturesAreStillRefusedWhateverTheConfirmation`)

- [x] Red: `aBlockedClaimIsKeptAndReceiptedWhileTheRestSettles` → FAIL
- [x] Green: `Blocked` → `kept.add(...)`; `Refused` removed from the sealed type; callers (edge) adjusted to compile — `./gradlew --console=plain test --tests "*RemodelClaimsServiceTest*"` → PASS
- [x] Commit; Execution status.

## Phase 2 — `venue` gate verdict + kept sets

**Files:** Create `GateVerdict.java` · Modify `RemodelGate`, `BeachMapRemodel`, `LayoutWriter`, `LayoutWrite`, `LayoutDiff`, `LayoutCommitOutcome`, `BeachMapRemodelService`, `BeachMapEditService` · Test `LayoutDiffTest`, `LayoutWriterTest`, `BeachMapRemodelServiceTest`

- [x] Red: the three `LayoutWriterTest` cases + `LayoutDiffTest.keepingDropsTheKeptSets…` + `BeachMapRemodelServiceTest` displaced mapping → FAIL
- [x] Green — `./gradlew --console=plain test --tests "*LayoutWriterTest*" --tests "*LayoutDiffTest*" --tests "*BeachMapRemodelServiceTest*" --tests "*VenueAdminServiceTest*"` → PASS; structural net → PASS
- [x] Generalization pass (R-5 sweep). Commit; Execution status.

## Phase 3 — edge, wire, ITs, concurrency

**Files:** Modify `RemodelCommitService`, `RemodelCommitOutcome`, `RemodelCommitResponse`, `RemodelCommitController`, `RemodelReceiptView`, `WebSliceStubs`, `SpanReleaseIT` · Test `RemodelCommitIT`, `RemodelReceiptIT`, `MoveVsReserveConcurrencyIT`

- [x] Red: AC-1, AC-2, AC-6, AC-7 ITs → FAIL
- [x] Green — one IT class at a time under the hook's dockerd → PASS
- [x] Commit; open the **draft PR**; Execution status.

## Phase 4 — frontend

**Files:** Modify `operator-console.model.ts`, `remodel-preview-panel.{ts,html}`, `remodel-receipt-panel.ts`, fixtures, specs, `e2e/layout-editor.e2e.ts`

- [x] Red: the two panel specs + the model spec → `npm test -- remodel` FAIL
- [x] Green; `npm run lint`, `npm run format:check`, `npm test`, `npm run test:a11y`; e2e case with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- layout-editor`
- [x] Commit; Execution status.

## Phase 5 — docs, gates, close-out

- [x] RESPONSIBILITIES §booking / §venue / §Platform edge; CONTEXT.md; D9 marked landed (`riviera-docs-freshness`)
- [x] Merge `origin/main`; ready for review; review gate (`pr-gates.md` §1); Sonar (§2); close-out (§3)

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-25 | `RemodelGate` grows a verdict (R-5) | every gate lambda and every reader of `RemodelCommit`'s variants | `grep -rn "RemodelGate\|RemodelCommit\.\|-> true\|-> false" platform/src` + `compileTestJava` | `BeachMapEditService`, `LayoutWriterTest` ×4, `BeachMapRemodelServiceTest`, `WebSliceStubs` (`Refused` stub), `RemodelCommitService` | all moved to `GateVerdict`; the stub answers `Stale`; compiler confirms no fourth site |
| 2026-09-25 | `NewReceipt`/`RemodelReceipt` gain a trailing list | every constructor call | `grep -rn "new NewReceipt(\|new RemodelReceipt(" platform/src` | 13 sites (service, adapter, 9 tests) | all gain the kept list |
| 2026-09-25 | the FE `RemodelReceipt` gains `kept` | every receipt literal the panels render | `grep -rn "refundedTotal: null" frontend/src frontend/e2e` | 2 fixtures, 1 e2e mock | all gain `kept: []` |

---

## Acceptance-criteria verification (final)

- [x] AC-1..AC-8: `./gradlew test --tests "*RemodelCommitIT*" --tests "*RemodelReceiptIT*" --tests "*MoveVsReserveConcurrencyIT*" --tests "*RemodelClaimsServiceTest*" --tests "*LayoutWriterTest*" --tests "*LayoutDiffTest*" --tests "*BeachMapRemodelServiceTest*" --tests "*RemodelCommitMigrationIT*" --tests "*JdbcRemodelReceiptsIT*"` → PASS at `8d8a86e`.
- [x] AC-9: `ng test --include` over the three operator specs (26 passed) and `playwright test --config playwright.a11y.config.ts e2e/layout-editor.e2e.ts -g remodel` (4 passed) at `63ac8a8`.

## Self-review checklist

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] No JPA (#1). Availability section filled; concurrency test present (#2).
- [x] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [x] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [x] Payment N/A justified.
- [x] Flyway migration present; invariant-enforcing constraints tested (#12).
- [x] Frontend standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #1214` (forced onto its own commit by the hygiene guard on `96d7cb71`).
- [x] The review gate ran in full; if blocked, stated in the PR with the box unticked.
