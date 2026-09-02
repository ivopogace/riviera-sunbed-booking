-- #814 (epic #810), slice 4 of the review record: moderation state. A platform admin's takedown is
-- a reversible soft flag (ADR-0013's report-and-remove posture; reviews are cheap to keep, so hide
-- rather than delete), stored as a nullable instant rather than a boolean: NULL means visible, so
-- every row already in the table keeps its meaning, and a non-null value says when the review left
-- public view, which the admin's moderation list shows as "hidden since". The visibility predicate
-- (hidden_at IS NULL) lives in exactly the two statements of the review module's adapter that serve
-- the public: the aggregate totals and the venue-page listing. No index: both reads seek
-- review_venue_listing_idx (venue_id, id) and filter the few hidden rows after the seek.
-- Verified by ReviewMigrationIT.
ALTER TABLE review ADD COLUMN hidden_at TIMESTAMPTZ NULL;   -- UTC instant (invariant #6)
