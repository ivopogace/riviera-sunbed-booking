-- Closed for season (epic #1027): a venue-level state with an optional reopen date and an
-- advance-sales opt-in, default off. Reads compare dates in Europe/Tirane (invariant #6); no sweep.
-- The CHECK keeps an open venue bare (no reopen date, no opt-in) and ties the opt-in to a reopen
-- date; SeasonClosure is the Java mirror (ADR-0018 §3). Every existing venue reads open.
-- Verified by SeasonClosureMigrationIT.
ALTER TABLE venue
    ADD COLUMN closed_at TIMESTAMPTZ,
    ADD COLUMN reopen_on DATE,
    ADD COLUMN advance_sales BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT venue_season_closure_check
        CHECK ((closed_at IS NOT NULL OR (reopen_on IS NULL AND NOT advance_sales))
           AND (NOT advance_sales OR reopen_on IS NOT NULL));
