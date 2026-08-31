-- #723: bound the beach-map row label now operators can author it.
--
-- The layout editor gains a per-row name input, so row_label stops being the frontend's
-- derived grid letter and becomes operator-authored text that renders in the tourist map's
-- price rail (#702), booking views, and confirmation mail. V2 created the column as
-- unbounded TEXT because only the seed and the letter-writing editor ever filled it; an
-- authored label needs the same DB-side backstop the other set_position fields carry
-- (invariant #12). char_length counts code points, matching the application bound
-- (VenueFieldValidation.MAX_ROW_LABEL_LENGTH, checked in SetCommand), so the application
-- refuses first and this CHECK stays the race-safe backstop.
--
-- Safe against the existing rows: the longest label to date is the V3 seed's
-- 'Front row · Sea view' (20 characters), verified by BeachMapLayoutMigrationIT.

ALTER TABLE set_position
    ADD CONSTRAINT set_position_row_label_check CHECK (char_length(row_label) <= 40);
