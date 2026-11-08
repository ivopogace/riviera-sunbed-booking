-- The venue a collection pays (ADR-0029 decisions 1, 7, 11): a payment names one payee, so the one
-- column is the shape that keeps a payment from spanning venues.
--
-- payee_venue_id is a LOGICAL reference to venue.id (cross-module by id, invariant #11), never an FK,
-- as booking_ref is (V7, V64). It is nullable with no backfill: booking_ref is logical, so a row
-- cannot be guaranteed a venue, the app has no live payments, and only provider adapters that pay
-- a venue's own account will read it. No index: nothing reads it yet.

ALTER TABLE payment ADD COLUMN payee_venue_id BIGINT;
