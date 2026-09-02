-- #813 (epic #810), slice 3 of the review record: the stay a review is about, so the public list can
-- say "stayed July 2026" without the review module asking booking at read time (it is a leaf,
-- ADR-0015). The row stores the booking's service date; the read reduces it to a month, so the
-- exact day never reaches a tourist. Backfilled from booking.booking_date for every row already
-- written (booking_id is a NOT NULL FK, so the join covers them all) before the column is locked
-- NOT NULL — a row the backfill missed fails this migration rather than shipping a null.
ALTER TABLE review ADD COLUMN stay_date DATE;                 -- LocalDate in Europe/Tirane (#6)
UPDATE review r SET stay_date = b.booking_date FROM booking b WHERE b.id = r.booking_id;
ALTER TABLE review ALTER COLUMN stay_date SET NOT NULL;

-- The public list seeks newest-first within one venue: WHERE venue_id = ? AND id < ? ORDER BY id
-- DESC. A composite on (venue_id, id) serves that seek and, through its prefix, the aggregate
-- recompute's WHERE venue_id = ? that V45's single-column index served — so the old index is a
-- duplicate prefix and goes.
DROP INDEX review_venue_id_idx;
CREATE INDEX review_venue_listing_idx ON review (venue_id, id);
