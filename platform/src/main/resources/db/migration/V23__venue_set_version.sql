-- #226: a SEPARATE optimistic-concurrency token for the two operator set-position writes — the
-- beach-map replace (PUT /api/venues/{id}/beach-map, #172) and the per-row reprice
-- (PUT /api/venues/{id}/rows/{rowLabel}/price, #174).
--
-- Kept DISTINCT from the #224 profile `version` (V22) on purpose: those two writes touch only
-- set_position (map-replace deletes+reinserts and re-sends price_minor/price_currency; reprice
-- overwrites the price columns), while the profile write touches only venue + venue_amenity. A shared
-- token would false-stale an unrelated open tab — a profile/amenity edit must NOT invalidate an open
-- layout or pricing tab, and vice versa — so each surface carries its own counter.
--
-- Both set-writes share THIS one token because they write overlapping columns (price_minor lives on
-- set_position), so a replace and a reprice racing off the same loaded value must not both win. The
-- map read (VenueMapView) hands the token out; each write echoes it back and the service does a
-- conditional
--   UPDATE venue SET set_version = set_version + 1 WHERE id = :id AND set_version = :expectedVersion
-- 0 rows-affected (venue still present) ⇒ another writer bumped it since the load ⇒ STALE_WRITE (→ 409),
-- rather than clobber. Of two writers off the same value the winner bumps it; the loser's WHERE
-- re-evaluates (READ COMMITTED) to no match. Not FOR UPDATE — the conditional UPDATE is self-serializing
-- on the PK row; and the bump is acquired BEFORE the replace's lockSetsOfVenue FOR UPDATE (venue row
-- before its set rows in both write paths), so a replace-vs-reprice race can never deadlock.
--
-- BIGINT to match the id type and never wrap (mirrors V22's `version`). NOT NULL DEFAULT 0 back-fills
-- every existing row (the V3 Miramar seed included) to 0, and new inserts (JdbcVenues.insertVenue, which
-- does not set the column) take the DEFAULT — so the read always has a token to hand out. No index: the
-- write already targets the PRIMARY KEY (id), and set_version only ever appears alongside id = :id.

ALTER TABLE venue
    ADD COLUMN set_version BIGINT NOT NULL DEFAULT 0;
