-- A beach-map row is labelled by its grid letter, never named (issue #1586): every active set's row_label
-- becomes chr(64 + grid_y), the label every set write derives (venue.vocabulary.SetPlacement.rowLabelOf).
-- Retired sets keep theirs, as do the snapshot columns (remodel_commit, venue_caused_cancellation,
-- remodel_receipt_kept): they are history. Two statements, because set_position_cell_uniq is checked per
-- row: a swap (row 1 labelled B, row 2 A) collides mid-UPDATE, so every active label is parked first, as
-- the layout save parks a moving set. Two sets on one grid row sharing a position number under different
-- labels fail this migration loudly on that index; no editor path builds one.
UPDATE set_position SET row_label = chr(1) || id::text WHERE retired_at IS NULL;
UPDATE set_position SET row_label = chr(64 + grid_y) WHERE retired_at IS NULL;
