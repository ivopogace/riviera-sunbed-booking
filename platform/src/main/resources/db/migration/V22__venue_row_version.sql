-- #224: optimistic-concurrency token for the single-row venue-profile write.
--
-- The O8 (#177) profile PATCH is a full REPLACE that re-sends booking_mode + booking_cutoff
-- (invariant-#4 safety fields) seeded from the load, so a save from a STALE operator tab performs a
-- last-write-wins overwrite. This monotonic counter is the guard: the profile read returns it, the
-- write echoes it back, and the service does a conditional
--   UPDATE venue SET ..., version = version + 1 WHERE id = :id AND version = :expectedVersion
-- 0 rows-affected (with the venue still present) ⇒ another writer bumped it since the load ⇒ the
-- service returns STALE_WRITE (→ 409), rather than clobber. Of two writers off the same version the
-- winner bumps it; the loser's WHERE re-evaluates (READ COMMITTED) to no match. Not FOR UPDATE — the
-- conditional UPDATE is self-serializing on the PK row.
--
-- BIGINT to match the id type and never wrap. NOT NULL DEFAULT 0 back-fills every existing row
-- (the V3 Miramar seed included) to 0, and new inserts (JdbcVenues.insertVenue, which does not set
-- the column) take the DEFAULT — so the read always has a token to hand out. No index: the write
-- already targets the PRIMARY KEY (id), and version only ever appears alongside id = :id.

ALTER TABLE venue
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
