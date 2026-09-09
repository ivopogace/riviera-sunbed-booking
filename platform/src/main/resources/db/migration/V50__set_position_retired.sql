-- ADR-0019: a set that carries booking history is retired, never deleted. The booking.set_id FK is
-- RESTRICT (V5), so a set with one finished booking could never leave the map; the marker lets the
-- row stay for every booking, mail and staff lookup that names it while every layout, availability
-- and claim read forgets it. TIMESTAMPTZ, not a flag: it records when (invariant #6); NULL is active.
ALTER TABLE set_position
    ADD COLUMN retired_at TIMESTAMPTZ;

-- The layout-uniqueness rules (V2 cell, V12 grid) are rules about the ACTIVE map: a retired set's
-- row/position and grid cell must be reusable by the set that replaces it, and a retired row must
-- never block a re-add with a 500 the conflict probe (which reads the active view) did not predict.
-- Same names, so the write path's violation mapping and BeachMapLayoutMigrationIT keep recognising
-- them; a partial unique index reports a duplicate as "unique constraint <name>" exactly as the
-- constraint did. Both are led by venue_id under the same predicate every excluding read filters on,
-- so they double as the partial index those reads need — no third index.
ALTER TABLE set_position
    DROP CONSTRAINT set_position_cell_uniq,
    DROP CONSTRAINT set_position_grid_uniq;

CREATE UNIQUE INDEX set_position_cell_uniq
    ON set_position (venue_id, row_label, position_no)
    WHERE retired_at IS NULL;

CREATE UNIQUE INDEX set_position_grid_uniq
    ON set_position (venue_id, grid_x, grid_y)
    WHERE retired_at IS NULL;

-- The one read surface for every query that must forget a retired set (tourist list and counts, map,
-- availability calendar, operator daily view, layout locks and conflict probes, both claim paths).
-- Explicit column list: a later ADD COLUMN that a read needs is a visible CREATE OR REPLACE VIEW here,
-- never a silent omission. Only the SetBookingFacts adapter reads set_position itself
-- (RetiredSetExclusionArchitectureTests holds the line).
CREATE VIEW active_set_position AS
    SELECT id, venue_id, row_label, position_no, tier, pool, price_minor, price_currency,
           grid_x, grid_y, created_at
      FROM set_position
     WHERE retired_at IS NULL;
