-- #1099 (epic #806): the venue's optional location — its lat/lng pin on the riviera map, placed by
-- the operator by hand. NUMERIC, not a float: six decimal places (~0.11 m) is exact, so the pin a
-- later read returns is the one the operator dropped. No PostGIS, no spatial index, no geocoding —
-- proximity is client-side arithmetic over a double-digit venue list (epic decision; invariant #1).
-- Both columns are nullable and no existing row is touched: a venue with no pin is absent from the
-- riviera map and stays in the list, which is what lets the feature ship without a backfill.
-- The CHECK is the both-or-neither rule plus each coordinate's range; VenueLocation is the Java
-- mirror (ADR-0018 §3). Comparing the two IS NULL predicates keeps it two-valued — latitude =
-- longitude would be NULL on an absent pair, which a CHECK accepts.
-- Verified by VenueLocationMigrationIT.
ALTER TABLE venue
    ADD COLUMN latitude NUMERIC(8, 6),
    ADD COLUMN longitude NUMERIC(9, 6),
    ADD CONSTRAINT venue_location_check
        CHECK ((latitude IS NULL) = (longitude IS NULL)
           AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
           AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
