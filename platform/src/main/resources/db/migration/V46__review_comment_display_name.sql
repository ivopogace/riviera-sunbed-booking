-- #812 (epic #810), slice 2 of the review record: the tourist's words alongside their stars.
--
-- comment and display_name are the first free text the review table carries, so both are bounded by
-- a named CHECK rather than a varchar length: char_length counts characters the way the Java edge
-- validation counts code points, so the two state the same bound and the DB stays the backstop (the
-- V45 review_stars_check discipline). Both stay NULL-able — slice 1 recorded star-only rows and they
-- keep their meaning; the "display name is required" rule is slice 2's edge contract, not the
-- column's, so no row already in the table becomes illegal by this migration.
--
-- updated_at is stamped only by an edit, so NULL means "never edited since created_at".
-- Verified by ReviewMigrationIT.
ALTER TABLE review
    ADD COLUMN comment      TEXT        NULL,
    ADD COLUMN display_name TEXT        NULL,
    ADD COLUMN updated_at   TIMESTAMPTZ NULL,                -- UTC instant (invariant #6)
    ADD CONSTRAINT review_comment_length_check      CHECK (char_length(comment) <= 1000),
    ADD CONSTRAINT review_display_name_length_check CHECK (char_length(display_name) <= 60);
