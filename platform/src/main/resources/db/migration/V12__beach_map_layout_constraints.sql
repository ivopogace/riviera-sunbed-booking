-- U7 (issue #7): beach-map layout-integrity constraints for the venue write surface.
--
-- The venue beach-map editor (U7) is the first WRITER of set_position beyond the demo seed.
-- V2 created the table for the read-only map and constrained one set per (venue, row_label,
-- position_no), but left the render grid unconstrained because a fixed seed never collides.
-- An operator placing sets on a visual grid can: two sets on one cell, or a coordinate <= 0.
-- These constraints (invariant #12) are the layout analogue of invariant #2's "the DB constraint
-- is the concurrency primitive" — they make a malformed layout impossible at the database, not
-- just in the write path. JDBC-only (invariant #1); no new columns (V2/V10 already carry every
-- field U7 needs).
--
-- Safe against the existing Miramar seed (V3): its 24 sets occupy distinct (grid_x, grid_y)
-- cells with all coordinates and position numbers >= 1 (verified by BeachMapLayoutMigrationIT).

-- One set per render cell, per venue. The grid is the editor's coordinate space; a duplicate cell
-- would make the read map ambiguous. Named so the write path can recognise the violation (-> 409).
ALTER TABLE set_position
    ADD CONSTRAINT set_position_grid_uniq UNIQUE (venue_id, grid_x, grid_y);

-- Coordinates and position numbers are 1-based (V2 comments: "column 1..6", "row 1..4").
-- Reject 0/negative so the editor cannot persist an off-grid set.
ALTER TABLE set_position
    ADD CONSTRAINT set_position_grid_x_check CHECK (grid_x >= 1),
    ADD CONSTRAINT set_position_grid_y_check CHECK (grid_y >= 1),
    ADD CONSTRAINT set_position_no_check     CHECK (position_no >= 1);
