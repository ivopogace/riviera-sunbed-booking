# Diff-based bulk save — the beach-map PUT keeps, updates, inserts and retires, probes only disturbed sets, refuses by set Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** On a venue that has sold, an operator saves the whole painted grid through the bulk
PUT — adding a row, repricing or renaming one, repainting tier or pool on booked sets, removing
sets nobody is still owed — and every set that stays at its coordinate keeps its id; a save that
would remove a set someone is still owed is refused as a whole, naming those sets, and the editor
marks them with the lock decoration; `LAYOUT_IN_USE` no longer exists anywhere.

**Architecture:** The bulk PUT becomes a **diff keyed by grid coordinate** against the venue's
active map, computed under the same locks and the same `set_version` token as today: same
coordinate → `UPDATE` in place (row label, position, tier, pool, price), coordinate absent →
retire-or-delete, new coordinate → `INSERT`. Only the **removed** sets are probed, set by set,
through the `LiveClaims` holder the per-set guards and the owner's read already share — so the
sets a refusal names are exactly the sets the canvas already pins. The rejection is a third
sealed outcome carrying the blocking sets, mapped to `409 SETS_IN_USE` with a `sets` extension.

**Persistence:** JDBC only (invariant #1). No migration — the diff writes the existing
`set_position` columns and the V50 `retired_at` marker through the existing per-set
`UPDATE`/`DELETE`/retire statements plus a new locking read of the active map with its placements.

**Source of intent:** GitHub issue #1032 (parent epic #1027, revision 3 — user stories 15–16).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced: (1) the
PUT body carries **no set ids** and the canvas has **no drag-move gesture** (its drag is
drag-paint; a set moves through the set editor's armed Move, per the #1031 close-out), so a
"coordinate move" reaches the bulk save only as *coordinate absent + new coordinate* — the removal
question **is** the move question for this write, and identity is kept for every cell that stays
at its coordinate; (2) `positionNo` is derived from `gridX` by the editor, so at a kept coordinate
only the row label, tier, pool and price can differ — all four always editable since #1029/#1031;
(3) the replace's booking arm was `BookingPresence#hasBookings(VenueId)` — *any* booking, venue-wide
— whose only caller is the guard this slice removes, so the port loses that method; the live arm is
`LiveClaims#locksOn`, which answers set by set with the nearest dates and is the #1031 read's own
predicate; (4) `active_set_position` is what every set lock reads (V50), so the new placements read
selects from it and `RetiredSetExclusionArchitectureTests` stays green; (5) no open PR exists and no
Flyway number is claimed; the previous sibling #1028 closed out on the epic with PR #1049, and
`docs/plans/closed-for-season.md` retires in this PR's close-out; (6) the ADR-0019 consequences
list still describes the replace as "refused on any booking" — updated here; (7) the row-label
swap case (row A renamed B and B renamed A in one save) can collide transiently on the partial
unique index between two in-place updates — the `DuplicateKeyException → 409 CONFLICT` backstop
holds and nothing is written; recorded as R-4) · `riviera-plan-doc` (this template — forced a
seam per AC, the parity ledger for the retired venue-wide guard, and the module-ownership row for
the retire-or-delete decision) · `tdd` (each phase red first at the named seam: the diff unit
test, the service unit tests through `EditBeachMap`, the HTTP ITs, the concurrency IT, the Vitest
specs, the mocked e2e) · `riviera-review-overlay` (review gate — **ran** on PR #1050 over `6521f8d5..bcea4ac4`: five generic
reviewers plus the overlay walk; RV-BE-1/9, RV-CT-1/5, RV-STYLE-1, RV-PROC-1/2 clean; findings F-1..F-3 and F-5..F-6, all
fixed in the PR) · `riviera-docs-freshness` (**ran** over `6521f8d5..3a7ff04f`, zero findings: the rename grep for `LAYOUT_IN_USE`, `deleteAllSets`, `hasBookings(VenueId)` and the id-returning `lockSetsOfVenue` hits only ADR-0019's historical context; the counting sweep over the third `ReplaceLayoutOutcome` variant and the four `BookingPresence` probes finds every count already updated in this diff; the map walk finds no stated sentence falsified; `docs/plans/closed-for-season.md` retired, its slug cited nowhere as a plan path) ·
`grilling` (the intake questions answered from the code; the calls a colleague would make —
coordinate as the identity key, the token advancing on every successful save, the write order
removals → updates → inserts — are recorded as resolved assumptions below) ·
`riviera-local-debug` (clone unshallowed; system Gradle on the JDK 21 daemon compiling on the
JDK 25 toolchain; scoped `--tests`; the structural net after the SPI and port changes; the mocked
e2e via `PW_CHROMIUM_EXECUTABLE`) · `postgres` (no schema change; the new locking read is
`SELECT … FROM active_set_position … FOR UPDATE` on the same rows the old one locked, so the
lock footprint and the `FOR KEY SHARE` conflict with a racing claim's FK check are unchanged;
retire/delete/update reuse the indexed per-row statements; the write order frees a slot before
another set takes it) · `riviera-modulith` (everything stays in `venue`; `BookingPresence` — an
`spi` inversion `booking` implements — shrinks by one method, no new port; the blocked-set value
and the placed-set value are `application/` records because their only consumer is the module's
own REST adapter, like `SetLock`) · `riviera-java-conventions` (a sealed outcome with a third
permitted variant instead of an enum constant that cannot carry data; records for the diff, the
placed set and the blocked set; the error contract: `SETS_IN_USE` 409 with a condition-only
detail and a `sets` extension property; one-line inline comments) · `codebase-design` (the diff
is a pure calculation with one caller, kept next to `LayoutCommand` as a package-private record
with a static factory so it is unit-tested through its own small interface; the claim question
keeps its one holder, `LiveClaims`, so the refusal and the canvas cannot disagree) ·
`domain-modeling` (no new glossary term: the refused sets **are** locked sets, and `CONTEXT.md`
already defines *Locked set*; the venue-wide "layout lock" leaves the vocabulary) ·
`riviera-frontend` (all changes stay in `operator/`; the wire type joins
`operator-console.model.ts`, the mapper `operator-console.service.ts`; no new cross-feature
edge) · `angular-developer` + angular-cli MCP (`get_best_practices` for the v22 workspace;
`search_documentation` verified: `signal`/`computed` — the refused sets are a plain signal
merged into the existing `locks` signal and resolved to cells through the existing
`lockByCoord` computed; `linkedSignal` — not needed, the state is reset explicitly on save,
regenerate and venue switch rather than derived from a source; `resource`/`httpResource` — not
adopted, the editor's writes stay on `firstValueFrom(HttpClient)` like every other write there;
Signal Forms — no form changes; `@if`/`@for` — the template already uses native control flow, the
banner and the legend branch on it) · `riviera-tailwind` (verified against tailwindcss.com:
`@theme inline` maps `--riv-card-ink` to `text-riv-card-ink`, which is how the gap cell now
states the ink its lock glyph inherits; the descendant arbitrary variant `[&_svg]:size-[9px]`
already used by the cell stays; `sr-only` for the cell's accessible description is a first-party
v4 utility; no `@apply`, no new token, no new colour — the highlight **is** the #1031 lock
decoration, so the only new contrast pair is the card ink over the wash behind a gap cell, proven
3:1 in both console themes) · `playwright-cli` (the mocked suite: add-a-row on a trading venue
asserting the one PUT payload keeps every seeded coordinate, and the refusal path asserting the
named cell wears the lock and the banner names it; the `LAYOUT_IN_USE` mocks retire).

**Branch:** `claude/riviera-issue-1032-gikjg4` (the session's designated remote branch stands in
for `feature/diff-based-bulk-save`).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a venue with a live booking on A1, when the owner PUTs a layout that keeps
  A1 and A2 at their coordinates and adds row B, then the outcome is `Replaced`, A1 and A2 keep
  their ids, B's sets are inserted and the token advances by one. *Seam:* `EditBeachMap#replaceLayout`
  over HTTP `PUT /api/venues/{venueId}/beach-map` · *Pinned by:* `BeachMapReplaceIT.addsARowOnAVenueWithALiveBooking`
- [x] **AC-2:** Given a live booking on A1, when the PUT repaints A1 to the walk-in pool, changes
  its tier and price and renames row A, then the save succeeds, A1 keeps its id and its
  availability row for the booked date survives. *Seam:* as AC-1 · *Pinned by:*
  `BeachMapReplaceIT.repaintsRenamesAndRepricesABookedSetInPlace`
- [x] **AC-3:** Given a live booking on A1 and a live staff hold on A2, when the PUT omits both
  coordinates, then the answer is `409 SETS_IN_USE` whose `sets` extension names A1 (bookedOn) and
  A2 (heldOn) with their ids, row labels and positions, nothing is written and the token does not
  advance; a new position number at a booked set's kept cell is refused the same way. *Seam:* as
  AC-1 · *Pinned by:* `BeachMapReplaceIT.refusesRemovingBookedOrHeldSetsNamingThem`,
  `.refusesRenumberingABookedSetAtItsCell`
- [x] **AC-2b:** Given two kept sets that swap row names in one save, then both keep their ids and
  carry the other's label. *Seam:* as AC-1 · *Pinned by:* `BeachMapReplaceIT.swapsTwoRowNamesInOneSaveOnATradingVenue`
- [x] **AC-4:** Given a set whose only bookings are terminal, when the PUT omits its coordinate,
  then the set is retired (`retired_at` stamped, row kept) and its coordinate is free for a new set;
  given a set with no booking, the same PUT deletes it. *Seam:* as AC-1 · *Pinned by:*
  `BeachMapReplaceIT.retiresARemovedSetWithHistoryAndDeletesOneWithout`
- [x] **AC-5:** Given two owners who both loaded `set_version = V`, when both submit a diff save,
  then exactly one is `Replaced` and the other `Rejected(STALE_WRITE)`, the token ends at `V+1`, and
  the kept set carries one writer's price. *Seam:* `EditBeachMap#replaceLayout` · *Pinned by:*
  `BeachMapDiffConcurrencyIT.exactlyOneDiffSaveWins`
- [x] **AC-6:** Given a walk-in mark racing a diff save that removes the marked set, then never
  both succeed: the mark either commits and the save is `Blocked` naming the set, or the save wins
  and the mark fails its FK. *Seam:* `EditBeachMap#replaceLayout` beside a raw
  `set_availability` insert · *Pinned by:* `BeachMapDiffConcurrencyIT.aRacingMarkOnARemovedSetIsSeenOrBlocks`
- [x] **AC-7:** Given stored sets and an incoming layout, when the diff is computed, then a kept
  coordinate is an update carrying the stored id, an absent one a removal, a new one an insert, and
  a gap-shaped regenerate over a smaller grid removes exactly the out-of-bounds sets. *Seam:*
  `LayoutDiff.of(List<PlacedSet>, LayoutCommand)` · *Pinned by:* `LayoutDiffTest.*`
- [x] **AC-8:** Given the service, when a removed set is locked, then no write happens, the lock
  question is asked only about the removed sets and only after the rows are locked, and the venue
  row was locked first; a retired removal calls `retireSet` and a clean one `deleteSet`. *Seam:*
  `EditBeachMap#replaceLayout` with fakes · *Pinned by:* `VenueAdminServiceTest.replace*`
- [x] **AC-9:** Given the editor loaded a trading venue, when the PUT answers `409 SETS_IN_USE`
  naming a set whose cell the draft painted as a gap, then that cell wears the lock glyph with the
  reason as its description, the legend counts it, the banner lists the set by row and position with
  its reason, and painting it back to a tier clears nothing until the next save. *Seam:* the
  `LayoutEditor` component through its DOM and the mocked `HttpTestingController` · *Pinned by:*
  `layout-editor.spec.ts` "marks the sets a refused save names…" + `layout-editor.a11y.spec.ts`
  + `layout-editor.contrast.spec.ts` (gap-cell glyph ink)
- [x] **AC-10:** Given a trading venue with locks, when the operator regenerates with one more row
  and saves, then the one PUT keeps every seeded coordinate and adds the row; and a `409 SETS_IN_USE`
  answer marks the named cell. *Seam:* the running SPA against `page.route` mocks · *Pinned by:*
  `frontend/e2e/layout-editor.e2e.ts` "adds a row on a trading venue…" and "…marks the sets a refusal names"
- [x] **AC-11:** `LAYOUT_IN_USE` appears in no production or test source, backend or frontend;
  `BookingPresence#hasBookings(VenueId)` and `Venues#deleteAllSets` are gone. *Seam:* the tree ·
  *Pinned by:* `git grep -n LAYOUT_IN_USE` empty on the branch (verified at close-out) + compilation
- [x] **AC-12:** The structural net is green after the port changes. *Seam:* the six net tests ·
  *Pinned by:* the net command in `CLAUDE.md`

## Non-goals

- The remodel preview, the move of a booking to another set and `STALE_PREVIEW` (#1033, #1034).
- Set ids on the PUT body or a drag-move gesture on the canvas — a kept coordinate is the identity.
- A batch "ever booked" probe on `BookingPresence`: removals are probed one set at a time through
  the existing `hasBookings(SetId)`; a regenerate that removes hundreds of sets is a rare action.
- Skipping the `UPDATE` for a kept cell whose fields did not change.
- Lifting the tourist visibility fence on the owner's read (the #1031 note).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Owner asserted before any read (invariant #13) | preserved | unchanged first line of `replaceLayout` |
| `EMPTY_LAYOUT`, `LAYOUT_TOO_LARGE`, `DUPLICATE_POSITION`, `CELL_TAKEN`, `ROW_NAME_TAKEN`, `NO_SUCH_VENUE` pre-checks | preserved | unchanged, before the locks |
| Venue row locked and token read before the set rows; `STALE_WRITE` on mismatch | preserved | `lockAndReadSetVersion` then `lockSetsOfVenue` — same order, same statements |
| Every active set row locked `FOR UPDATE` before the probe | preserved | `lockSetsOfVenue` now also returns each row's placement; same `FOR UPDATE` on `active_set_position` |
| Refused when any set has a hold today-or-later | changed | only a **removed** set's hold refuses (`SetsInUse`); a kept set's hold is untouched by an in-place update |
| Refused when the venue has any booking ever | changed | only a **removed** set's **live** booking refuses; a removed set with finished bookings is retired (ADR-0019) |
| One venue-wide `LAYOUT_IN_USE` code | dropped | `SETS_IN_USE` names the blocking sets; the code and its copy leave both vocabularies |
| Delete every active set, insert the batch | changed | update kept coordinates in place, insert new ones, retire-or-delete absent ones |
| A past hold goes with its deleted set (CASCADE) | preserved | a removed set with only past holds and no booking is deleted; the CASCADE still sweeps its rows |
| Token advanced once on success, never on a rejection | preserved | `incrementSetVersion` on the success path only |
| `204 No Content` on success | preserved | unchanged |
| Editor advances its token by one after `204`, resets the shared snapshot, re-baselines the grid | preserved | unchanged in `onSave` |
| Editor copy "replacing the whole layout is locked … arm Select" | dropped | the banner names the refused sets and how to keep them |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A claim racing the save lands on a set the save removes (invariant #2) | med | high | unchanged lock order: venue row, then every active set row `FOR UPDATE`, then the probe; a racing claim's FK `FOR KEY SHARE` blocks until the save ends; pinned by AC-6 | session | closed — 0d712411 (`BeachMapDiffConcurrencyIT.aRacingMarkOnARemovedSetIsSeenOrBlocks`) |
| R-2 | Two saves off the same token both write | med | high | `set_version` read under the venue row lock, advanced once on success; AC-5 | session | closed — 0d712411 (`BeachMapDiffConcurrencyIT.exactlyOneDiffSaveWins`) |
| R-3 | A refused set the editor cannot show (its coordinate is outside the regenerated grid) | med | low | the banner names every refused set by row and position; the cells inside the grid wear the glyph; e2e + Vitest | session | closed — ff22b51f |
| R-4 | A row-label swap in one save collides transiently on the partial unique index between two in-place updates | low | low | write order removals → updates → inserts frees slots first; the swap case rolls back to the `DuplicateKeyException → 409 CONFLICT` backstop, nothing written, the editor shows "Two sets overlap" | session | closed — superseded by F-5: the colliding labels are parked first, so the swap saves |
| R-5 | A removed set retired while still holding a *past* availability row keeps that row (no CASCADE on retire) | low | none | a past row is history nothing reads or claims; the retire path already behaves so for `removeSet` | session | closed — by design (ADR-0019) |
| R-6 | Ownership on a venue-scoped endpoint (BOLA) | low | high | `VenueOwnership#assertOwns` stays the first act of the service; `VenueAdminServiceTest.replaceByANonOwnerIsDeniedBeforeAnyRead` | session | closed — 6f384795 |
| R-7 | Error-contract drift on the new code | low | med | `SETS_IN_USE` 409, detail "Sets this save would remove are booked or held." (condition, not remedy); `sets` extension built beside the problem in the controller through `ApiProblem.of` | session | closed — 0d712411 (`BeachMapReplaceIT.refusesRemovingBookedOrHeldSetsNamingThem`) |
| R-8 | The `@ApplicationModuleTest`s or `WebSliceStubs` break on the SPI/port change | low | med | `BookingPresence` loses a method — implementors shrink, no bean moves; module tests run before the push | session | closed — no bean moved; the full test tree compiles and the touched ITs pass (0d712411) |

## Open questions / Assumptions

### Resolved

- **The token advances on every successful save**, an unchanged layout included, so the editor's
  `+1` after `204` stays correct — 6f384795 (`EditBeachMap#replaceLayout` Javadoc).
- **Coordinate is the identity key; a "move" is a removal plus an insert.** The body carries no ids
  and the canvas has no drag-move; the removal question is the claim question the epic names for a
  moved set, and identity is kept for every cell that stays put. — resolved at plan time (code fact).
- **Only live claims refuse; finished history retires.** `LiveClaims#locksOn` on the removed ids —
  the #1031 read's own predicate — decides the refusal; `BookingPresence#hasBookings(SetId)` decides
  retire vs delete. `hasBookings(VenueId)` loses its last caller and leaves the SPI. — plan time.
- **Write order removals → updates → inserts**, each through the existing per-row statements;
  `deleteAllSets` leaves the port. — plan time.
- **The refusal reuses the lock decoration, not a new colour.** The named sets merge into the
  editor's `locks`; a cell inside the grid wears the padlock and its description, the legend counts
  it, the gap brush refuses it; the banner names all of them. — plan time.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** none added. The save never writes that
  table; a deleted set's rows go with it by `ON DELETE CASCADE` (only when no live row exists — the
  probe refuses otherwise), a retired set keeps its rows.
- **Uniqueness guarantee:** `set_availability UNIQUE (set_id, booking_date)` (V4), untouched.
- **Concurrency strategy:** the venue row `FOR UPDATE` (token read), then every active set row
  `FOR UPDATE` (`lockSetsOfVenue`), then the probe on the removed subset, then the writes — the
  order every set-write takes. A racing claim's `FOR KEY SHARE` on a set row blocks until the save
  ends, so it is seen by the probe or fails its FK after a delete; a claim on a *kept* set is never
  disturbed, because the kept row is updated, not deleted.
- **Pool rule (invariant #3):** a pool flip on a kept set is an in-place update; a claim racing it
  reads the committed pool through `poolForClaim`'s `FOR KEY SHARE`, exactly as the batch apply.
- **Cutoff rule (invariant #4):** not in play; the hold arm's cutoff is `LiveClaims#today()` in
  `Europe/Tirane` (invariant #6), unchanged.
- **Pinning test:** `BeachMapDiffConcurrencyIT.aRacingMarkOnARemovedSetIsSeenOrBlocks` +
  `.exactlyOneDiffSaveWins`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `set_position` | owns the beach map and every layout write |
| M-2 | `booking` | existing | — | implements `venue.spi.BookingPresence`; one method removed |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.spi` | `BookingPresence` (− `hasBookings(VenueId)`) | `SetId`, `VenueId`, `LiveBookingCounts` | implemented by `booking` |

**Domain events:** none.

### Module ownership (§4a)

| Capability | Owner module | Justification |
|---|---|---|
| Diff a submitted layout against the stored map | `venue` | `venue` Job: the beach map and its layout writes; a pure calculation on `venue`'s own placements |
| Decide which removed sets refuse the save | `venue` (`LiveClaims`) | the one predicate the write guards and the owner's read share (RESPONSIBILITIES.md §venue); *which statuses are live* stays `booking`'s through the SPI |
| Retire vs delete a removed set | `venue` | ADR-0019: the marker is `venue`'s; the "ever booked" fact comes from `booking` through `BookingPresence#hasBookings(SetId)` |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` + `.html` | existing | standalone component | signals; refused sets merged into `locks`, resolved by the existing `lockByCoord` computed; the banner from `computed` text | none |
| FE-2 | `operator/beach-cell.ts` | existing | variant directive | — (the gap variant states its ink) | — |
| FE-3 | `operator/operator-console.model.ts` / `.service.ts` | existing | model + `@Service` | `SETS_IN_USE` code, `layoutBlockedSetsOf` extension reader | — |

**Standards:** standalone, `inject()`, native control flow, signal state — no deviation.

## FE↔BE contract

- **Changed endpoint:** `PUT /api/venues/{venueId}/beach-map` — request unchanged; new failure
  `409 application/problem+json { code: "SETS_IN_USE", detail, sets: [{ setId, rowLabel,
  positionNo, bookedOn, heldOn }] }` with the dates ISO `YYYY-MM-DD` or `null`, never both null.
  `LAYOUT_IN_USE` is never answered.
- **Client typing:** hand-written `BlockedSet` in `operator-console.model.ts` (structurally a
  `SetLock` plus its label), read by `layoutBlockedSetsOf(error)`; no `as any`.
- **Money/date on the wire:** unchanged (minor units + currency; ISO dates).

## Execution status

**Stage pointer:** `DONE — merged via PR #1050`

**Next action:** none — close-out written; this plan retires at the next close-out of any kind.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the diff calculation | ✅ | d5fbe23c |
| 1 — the service: diff save, blocked outcome, retired SPI method | ✅ | 6f384795 |
| 2 — the edge: `SETS_IN_USE` + `sets`, HTTP ITs, concurrency IT, net | ✅ | 0d712411 |
| 3 — the editor: highlight, banner, vocabulary retirement, Vitest + a11y + contrast | ✅ | ff22b51f |
| 4 — the mocked e2e | ✅ | ff22b51f |
| 5 — docs: RESPONSIBILITIES §venue, ADR-0019, Javadoc; close-out | ✅ | afb37272 (docs); bcea4ac4 (status); fefc720e, 3f684c47 (review fixes); f7c22f59, 3a7ff04f (the ported `SeasonClosureReserveIT` cleanup, F-4); close-out in the final commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Sonar note** — the `SonarCloud Code Analysis` check concluded `success` on `3a7ff04f`; the API
list for PR #1050 (`api/issues/search … resolved=false`) answers `total: 0`, and the measures
carry `new_lines 423`, `new_bugs 0`, `new_vulnerabilities 0`, `new_code_smells 0`,
`new_duplicated_blocks 0`, `new_duplicated_lines_density 0.0`, `new_coverage 98.2`. Nothing to
clear. CI on `3a7ff04f`: every job green; the backend suite reports no skipped tests.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review (prior-PR-comments reviewer, RV-PROC-2c) | `set-editor.ts` class TSDoc still said the bulk PUT is reject-unless-unclaimed and the map frozen after the first booking | fixed — the TSDoc states the diff save |
| F-2 | review (prior-PR-comments reviewer, §6d) | `VenueAdminController` class Javadoc's outcome→HTTP list lacked the new `SetsInUse`→409 | fixed |
| F-3 | review (generalisation sweep of F-1 by mechanism: prose stating the old venue-wide lock — `git grep -i "reject-unless-unclaimed\|map is frozen\|layout is locked"` over `platform/src frontend/src frontend/e2e RESPONSIBILITIES.md CONTEXT.md docs/adr .claude/skills`) | `layout-editor.html`'s row-names helper said a rename works "even when saving the whole layout is locked" | fixed — the sentence no longer names a lock |
| F-5 | review (git-history reviewer) | a swap or rotation of row names between kept cells collided transiently on the partial unique index — the delete-all replace never could — and fell to the `409 CONFLICT` backstop (plan R-4) | fixed — `LayoutDiff#collidingUpdates` + `Venues#parkRowLabels` park the labels before the in-place updates; `BeachMapReplaceIT.swapsTwoRowNamesInOneSaveOnATradingVenue` |
| F-6 | review (git-history reviewer) | a position-number change at a kept cell — the per-set `editSet` refuses it on a claimed set ("a guest was told this row and number") — went through the bulk save unprobed | fixed — `LayoutDiff#disturbed` probes removed and repositioned sets alike; `BeachMapReplaceIT.refusesRenumberingABookedSetAtItsCell` |
| F-4 | CI (`Backend (build + test)` on `0d712411`) | `SeasonClosureReserveIT.theOptInReservesDatesOnOrAfterTheReopenDayOnly` — the sibling test's `@AfterEach` races the async spine; `main` fails identically at the base commit | not this PR's, but deterministic (three identical runs, reproduces alone: `payout_ledger_entry_booking_id_fkey` on the cleanup's booking delete) — ported the test-only fix into this PR: the cleanup first awaits the publication registry's drain (the confirmed reserve fans out after the response), then deletes the ledger, mail-attempt and review rows before the bookings; declared on PR #1050 |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutDiff.java` — the coordinate-keyed diff (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/PlacedSet.java` — a locked active set: id + placement (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/BlockedSet.java` — a removed set a live claim pins: label + lock (new)
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapEditService.java` — the diff save
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `lockSetsOfVenue` returns placements; `deleteAllSets` gone
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — the contract of `replaceLayout`
- `platform/src/main/java/ai/riviera/platform/venue/application/ReplaceLayoutOutcome.java` — the `SetsInUse` variant
- `platform/src/main/java/ai/riviera/platform/venue/application/ReplaceRejection.java` — `LAYOUT_IN_USE` removed
- `platform/src/main/java/ai/riviera/platform/venue/application/SetRejection.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/application/LayoutCommand.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — `SETS_IN_USE` mapping
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/BlockedSetView.java` — the `sets` extension element (new)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/BeachMapLayoutRequest.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — the placements lock read
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — `hasBookings(VenueId)` removed
- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — the venue probe removed
- `platform/src/test/java/ai/riviera/platform/venue/application/LayoutDiffTest.java` — AC-7 (new)
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-8
- `platform/src/test/java/ai/riviera/platform/venue/application/LiveClaimsTest.java` — fake shrinks
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — AC-1..4
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapDiffConcurrencyIT.java` — AC-5, AC-6 (new)
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceConcurrencyIT.java` — Javadoc
- `platform/src/test/java/ai/riviera/platform/venue/VenueRowRenameIT.java` — comment
- `platform/src/test/java/ai/riviera/platform/venue/VenueSetWriteConcurrencyIT.java` — comment
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — the venue probe assertions removed
- `platform/src/test/java/ai/riviera/platform/booking/SeasonClosureReserveIT.java` — ported fix (F-4): the cleanup deletes a booking's dependents first
- `frontend/src/app/operator/operator-console.model.ts` — `SETS_IN_USE`, `BlockedSet`
- `frontend/src/app/operator/operator-console.service.ts` — `layoutErrorOf`, `layoutBlockedSetsOf`
- `frontend/src/app/operator/operator-console.service.spec.ts` — the mapper specs
- `frontend/src/app/operator/layout-editor.ts` — the refused sets, the banner text
- `frontend/src/app/operator/layout-editor.html` — the banner
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-9
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — AC-9
- `frontend/src/app/operator/layout-editor.contrast.spec.ts` — AC-9
- `frontend/src/app/operator/beach-cell.ts` — the gap cell's ink
- `frontend/src/app/operator/set-editor.ts` — class TSDoc (F-1)
- `frontend/e2e/layout-editor.e2e.ts` — AC-10
- `frontend/e2e/operator-set-editing.e2e.ts` — the `LAYOUT_IN_USE` mock retires
- `RESPONSIBILITIES.md` — §venue layout-write paragraph
- `docs/adr/ADR-0019-retire-a-set-that-carries-history.md` — consequences
- `docs/plans/diff-based-bulk-save.md` — this plan
- `docs/plans/closed-for-season.md` — retired at close-out

---

## Phase 0 — the diff calculation

**Files:** Create `LayoutDiff.java`, `PlacedSet.java` · Test `LayoutDiffTest.java`

- [x] **Step 1: Write the failing test** — kept coordinate → update with the stored id; absent →
  removed; new → insert; a 1×1 regenerate over a 2×2 map removes three.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*LayoutDiffTest*"` → compilation failure
- [x] **Step 3: Minimal implementation** — `record LayoutDiff(List<Update> updates, List<SetCommand> inserts, List<PlacedSet> removed)` with `static of(List<PlacedSet>, LayoutCommand)`
- [x] **Step 4: Run it, verify it passes**
- [x] **Step 5: Generalization audit** — N/A, no bug fix
- [x] **Step 6: Commit** — `Compute the beach-map save as a diff keyed by coordinate (#1032)`

## Phase 1 — the service

**Files:** Modify `BeachMapEditService.java`, `Venues.java`, `EditBeachMap.java`, `ReplaceLayoutOutcome.java`, `ReplaceRejection.java`, `BookingPresence.java`, `JdbcBookingPresence.java`, `JdbcVenues.java` · Create `BlockedSet.java` · Test `VenueAdminServiceTest.java`, `LiveClaimsTest.java`, `JdbcBookingPresenceIT.java`

- [x] **Step 1: Failing tests** — AC-8 cases against the fakes.
- [x] **Step 2: Run** — `--tests "*VenueAdminServiceTest*"` → FAIL
- [x] **Step 3: Implement** — the diff save under the unchanged lock order; `SetsInUse` outcome.
- [x] **Step 4: Run** → PASS; then the structural net.
- [x] **Step 6: Commit** — `Save the beach map as a diff: keep, update, insert, retire; refuse by set (#1032)`

## Phase 2 — the edge

**Files:** Modify `VenueAdminController.java`, `BeachMapReplaceIT.java` · Create `BlockedSetView.java`, `BeachMapDiffConcurrencyIT.java`

- [x] **Step 1: Failing ITs** — AC-1..6.
- [x] **Step 2: Run** — one class at a time
- [x] **Step 3: Implement** — `SETS_IN_USE` + `sets`.
- [x] **Step 4: Run** → PASS
- [x] **Step 6: Commit** — `Answer 409 SETS_IN_USE with the blocking sets; pin the diff save's races (#1032)`

## Phase 3 — the editor

**Files:** Modify the `operator/` files listed above.

- [x] **Step 1: Failing specs** — AC-9; the mapper specs.
- [x] **Step 2: Run** — `npm test -- layout-editor` → FAIL
- [x] **Step 3: Implement** — merge the refused sets into `locks`; the banner; the gap cell ink.
- [x] **Step 4: Run** → PASS, plus `npm run lint`, `npm run format:check`, `npm run test:a11y`
- [x] **Step 6: Commit** — `Mark the sets a refused save names with the lock decoration; retire LAYOUT_IN_USE (#1032)`

## Phase 4 — the mocked e2e

- [x] AC-10 specs green under `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y -- layout-editor operator-set-editing`
- [x] **Commit** — `Drive add-a-row on a trading venue and the refusal highlight end to end (#1032)`

## Phase 5 — docs and close-out

- [x] RESPONSIBILITIES §venue, ADR-0019, Javadoc sweep; `git grep LAYOUT_IN_USE` empty.
- [x] Plan doc execution status; `node scripts/check-plan-file-structure.mjs --diff origin/main`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-09 | review F-1 | prose anywhere in code, templates, e2e and the substrate that states the retired venue-wide layout lock as present fact | `git grep -n -i "reject-unless-unclaimed\|map is frozen\|first booking\|has ever sold\|ever been booked\|layout is locked\|whole layout" -- platform/src frontend/src frontend/e2e RESPONSIBILITIES.md CONTEXT.md docs/adr .claude/skills` | 5 hits: `set-editor.ts` (F-1), `layout-editor.html:158` (F-3); `CONTEXT.md:62`, `BeachMapEditService.java:20`, `BookingPresence.java:12`, the e2e title — all still true | fixed the two, kept the rest |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-4, AC-2b:** `gradle test --tests "*BeachMapReplaceIT*"` → 16 tests green, verified at `3a7ff04f` (CI run 34345044399).
- [x] **AC-5, AC-6:** `gradle test --tests "*BeachMapDiffConcurrencyIT*"` → 9 repetitions green, same run.
- [x] **AC-7, AC-8:** `gradle test --tests "*LayoutDiffTest*" --tests "*VenueAdminServiceTest*"` → green, same run.
- [x] **AC-9:** `npx ng test --watch=false --include=src/app/operator/layout-editor*.spec.ts --include=src/app/operator/operator-console.service.spec.ts` → green, same run (Vitest job).
- [x] **AC-10:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → the two layout-editor specs green locally and in the frontend job.
- [x] **AC-11:** `git grep -n LAYOUT_IN_USE -- . ':!docs/plans'` → only ADR-0019's consequence naming it as retired; `hasBookings(VenueId)` and `deleteAllSets` compile nowhere.
- [x] **AC-12:** the structural net green locally after every backend change and in CI.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled; concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports (invariant #11).
- [x] **Payment/payout** N/A.
- [x] Refund policy N/A.
- [x] Timezone correct: `Europe/Tirane` for the hold cutoff (invariant #6).
- [x] Booking codes N/A.
- [x] No schema change (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR, in its last code-touching commit.**
- [x] **The review gate ran in full.**
