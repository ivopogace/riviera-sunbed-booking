# Remove row renaming Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a beach-map row's label is always its grid letter (`chr(64 + grid_y)`): no route, port or
UI renames a row, every set write derives the label from `grid_y`, and a forward migration rewrites
the live map to match.

**Architecture:** the label becomes a pure function of the grid row, `SetPlacement.rowLabelOf(gridY)`
in `venue.vocabulary`, used by every inbound cell (`SetCommand`, `LayoutCell`, the remodel preview's
placement), so the save, the remodel commit, the preview and the single-set add/edit cannot disagree
and one label per physical row holds by construction. The body's `rowLabel` is no longer read.

**Source of intent:** GitHub issue #1586 (scope 1–6 + ACs; owner: nothing is live, no
data-preservation step).

**Branch:** `feature/remove-row-renaming-1586`

## Acceptance criteria

- [ ] **AC-1:** Given the rename chain is deleted, when `grep -rn "renameRow\|RowNameCommand\|RowNameRequest\|ROW_NAME_TAKEN"` runs over `platform/src/main` and `frontend/src/app`, then it finds nothing, and `PUT /api/venues/{id}/rows/{rowLabel}/name` is not a route. *Seam:* the HTTP route table · *Pinned by:* the grep (PR body) + `VenueWriteRoleGateTest` losing its rename cases.
- [ ] **AC-2:** Given an owner's bulk save whose cells carry authored labels (`"Front row"`, `"Pines"`), when `PUT …/beach-map` succeeds, then every stored active set's `row_label` is the letter of its `grid_y`. *Seam:* `PUT /api/venues/{id}/beach-map` · *Pinned by:* `BeachMapReplaceIT.storesEachSetsGridLetterWhateverTheBodySays`.
- [ ] **AC-3:** Given a cell on grid row 27, when it is saved (bulk, remodel commit, add/edit), then it is refused `400` (the alphabet has 26 letters; the editor caps rows at 26). *Seam:* `SetCommand` / `LayoutCell` construction · *Pinned by:* `SetCommandTest`, `LayoutCellTest`.
- [ ] **AC-4:** Given the seeded Miramar venue (authored labels `Front row · Sea view`, `Row 2`…) and a retired set, when V78 runs, then every active `set_position.row_label = chr(64 + grid_y)` and the retired set's label is unchanged. *Seam:* Flyway schema · *Pinned by:* `RowLabelGridLetterMigrationIT`.
- [ ] **AC-5:** Given the layout editor, when it renders, then no "Row names" section, input or rename call exists, and a save sends no row label (the server letters each row). *Seam:* `LayoutEditor` DOM + `HttpTestingController` · *Pinned by:* `layout-editor.spec.ts`, `layout-editor.e2e.ts`.
- [ ] **AC-6:** Given a stored letter `A`, when the tourist map, booking dialog, booking view or mail render it, then they read "Row A · spot N" (unchanged `rowName()` in `shared/set-label.ts`; mail's existing letter case). *Pinned by:* existing `set-label.spec.ts` / `SmtpMailerIT` letter cases.

## Non-goals

- The V43 40-char `set_position_row_label_check` stays.
- Snapshot columns (`remodel_commit.from_/to_row_label`, `venue_caused_cancellation.row_label`,
  `remodel_receipt_kept.row_label`) and retired sets' labels are history; untouched.
- Frontend fixtures that name authored rows in unrelated specs stay (they are display data).
- The `row_label` column is kept (every read surface, the price-by-row route and the slot index use it).

## Risks

- **R-1:** a single-statement rewrite trips the non-deferrable partial unique index
  `set_position_cell_uniq (venue_id, row_label, position_no)` mid-update (row 1 labelled `B`, row 2
  `A`) → park every active label to `chr(1) || id` first, then write the letter (the save's own
  `parkRowLabels` trick).
- **R-2:** two active sets on one grid row sharing a position number under different labels would
  collide after the rewrite → the layout editor named labels per grid row and the set editor copied a
  sibling's label, so no UI path built it; if a dev DB holds one, the migration aborts on the unique
  index (Flyway rolls back, loudly) rather than corrupting a slot.
- **R-3:** preview and commit classify differently → both now derive the label; the preview's diff
  already keys on cell + position only (`LayoutDiff.disturbedBy`).
- **R-4:** Flyway `V78` collision with a sibling → none of the open PRs carries a migration at
  intake; whoever merges second renumbers.
- **R-5:** BOLA (#13) unchanged: the deleted route was the only new surface; the save keeps
  `assertOwns` first.

## Open questions

### Resolved

- Single-set `addSet`/`editSet` also derive (not just the bulk save): otherwise they could still
  give a set a non-letter label and re-split a row. Same derivation point (`SetCommand`).

## Availability & concurrency

- **Write paths to `set_availability`:** none changed. The bulk save's lock order (venue row, then
  `FOR UPDATE` on active sets, then the gate/probe) is untouched; a label never changes without a
  `grid_y` change now, and a `grid_y` change is a removal + insert already probed.
- **Pinning test:** `BeachMapReplaceConcurrencyIT`, `VenueSetWriteConcurrencyIT` (rename race dropped).

## Behaviour-parity ledger

| Old-surface behaviour | Verdict | Why |
|---|---|---|
| `PUT …/rows/{rowLabel}/name` renames a row | dropped | rows are labelled by grid letter (#1586) |
| `409 ROW_NAME_TAKEN` (rename + bulk save split label) | dropped | one label per grid row by construction |
| Bulk save stores the body's `rowLabel` | changed | derived from `gridY`; body field ignored |
| `addSet`/`editSet` store the body's `rowLabel` | changed | derived from `gridY` |
| Remodel preview/commit read cell `rowLabel` | changed | derived from `gridY` |
| Layout editor "Row names" panel | dropped | nothing to name |
| `PUT …/rows/{rowLabel}/price` | preserved | path label is now the letter |

## FE↔BE contract

- Removed: `PUT /api/venues/{id}/rows/{rowLabel}/name`, `ROW_NAME_TAKEN`.
- `PUT …/beach-map`, `POST/PATCH …/sets`, remodel preview/commit: `rowLabel` in a cell is accepted
  and ignored; reads still return `rowLabel` (now always the letter).

## Phases

- **Phase 0 — derive the label:** `SetPlacement.rowLabelOf`, `SetCommand`/`LayoutCell` drop the
  `rowLabel` component, preview derives · red `SetCommandTest`, `BeachMapReplaceIT` AC-2.
- **Phase 1 — delete the rename chain:** controller route, request, command, port + adapter methods,
  `ROW_NAME_TAKEN` (both enums), `splitsRowLabel`; tests pruned.
- **Phase 2 — migration V78:** red `RowLabelGridLetterMigrationIT`.
- **Phase 3 — frontend:** layout editor Row names UI/state, `renameRow`, `rowNameErrorOf`,
  `RowNameErrorCode`; specs + e2e.
- **Phase 4 — docs:** `RESPONSIBILITIES.md` § venue (~85, Row names bullet) and § Frontend phone-rail bullet.

## Execution status

**Stage pointer:** PR — CI on the full slice, then ready for review

**Next action:** check CI, mark ready, run the review gate (high).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — derive the label | ✅ | backend commit |
| 1 — delete rename chain | ✅ | backend commit |
| 2 — migration V78 | ✅ | backend commit |
| 3 — frontend | ✅ | frontend commit |
| 4 — docs | ✅ | frontend commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
