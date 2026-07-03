-- T7 (issue #140): venue-profile amenities + distance-to-water.
--
-- Amenities are a fixed-catalogue, order-insensitive SET per venue -> a join table with a
-- composite PK (dedup + order-insensitivity for free; the leading venue_id column also indexes
-- the FK lookup and the IN (...) list read, so no separate index is needed). The catalogue CHECK
-- is the DB-level backstop behind the application's edge validation (invariant #12); the wire code
-- is the enum name in ai.riviera.platform.venue.vocabulary.Amenity. ON DELETE CASCADE because
-- amenities are venue-profile data owned by the venue (not the append-only payout ledger).
--
-- distance_to_water_m is an OPTIONAL positive integer (metres); NULL means "not stated".

ALTER TABLE venue
    ADD COLUMN distance_to_water_m INTEGER
        CONSTRAINT venue_distance_to_water_positive
        CHECK (distance_to_water_m IS NULL OR distance_to_water_m > 0);

CREATE TABLE venue_amenity (
    venue_id BIGINT NOT NULL REFERENCES venue (id) ON DELETE CASCADE,
    amenity  TEXT   NOT NULL
        CONSTRAINT venue_amenity_catalogue_check
        CHECK (amenity IN ('BEACH_BAR', 'RESTAURANT', 'CAFE', 'FREE_PARKING', 'SHOWERS',
                           'WIFI', 'WATER_SPORTS', 'PET_FRIENDLY', 'SNACK_SHACK',
                           'SNORKELLING', 'QUIET_BAY')),
    PRIMARY KEY (venue_id, amenity)
);
