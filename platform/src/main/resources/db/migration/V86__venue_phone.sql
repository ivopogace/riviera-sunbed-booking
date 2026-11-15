-- The venue's own phone (#1746), shown to a guest only after booking: the booking view's help block and
-- the guest mails, never a public venue read. NULL means none given. Stored as ITU-T E.164 (+, a country
-- code not starting with 0, at most 15 digits), twinned by venue.vocabulary.VenuePhone.
-- Verified by VenuePhoneMigrationIT.
ALTER TABLE venue
    ADD COLUMN phone TEXT,
    ADD CONSTRAINT venue_phone_check
        CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
