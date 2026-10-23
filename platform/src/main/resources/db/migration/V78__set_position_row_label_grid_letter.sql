-- A beach-map row is labelled by its grid letter, never named (issue #1586): every active set's row_label
-- becomes chr(64 + grid_y), the label every set write derives (venue.vocabulary.SetPlacement.rowLabelOf).
-- Retired sets keep theirs, as do the snapshot columns (remodel_commit, venue_caused_cancellation,
-- remodel_receipt_kept): they are history.

-- An active set lives on one of the 26 lettered rows (SetPlacement.MAX_GRID_ROWS, the editors' cap). Added
-- validated and first, so a live set past row 26 fails this migration loudly before any label is rewritten.
-- The label itself gets no CHECK: the layout save parks a moving set's label mid-transaction.
ALTER TABLE set_position
    ADD CONSTRAINT set_position_grid_y_lettered_check CHECK (retired_at IS NOT NULL OR grid_y <= 26);

-- Parked first, as the layout save parks a moving set: set_position_cell_uniq is checked per row, so a
-- swap (row 1 labelled B, row 2 A) would collide mid-UPDATE. Two sets on one grid row sharing a position
-- number under different labels fail loudly on that index; no editor path builds one.
UPDATE set_position SET row_label = chr(1) || id::text WHERE retired_at IS NULL;
UPDATE set_position SET row_label = chr(64 + grid_y) WHERE retired_at IS NULL;
