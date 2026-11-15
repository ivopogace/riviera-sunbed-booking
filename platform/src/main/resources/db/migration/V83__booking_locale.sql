-- #1770: the language the guest booked in (ADR-0030), so every later mail for the booking is written
-- in it. Each stretch of a stay carries the stay's. Existing rows read as English, the source locale.
-- The CHECK lists shared.SiteLocale's codes and moves with it (BookingLocaleIT stores each value).
-- A constant DEFAULT makes the ADD COLUMN metadata-only; the CHECK validates rows that are all 'en'.
ALTER TABLE booking ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';

ALTER TABLE booking ADD CONSTRAINT booking_locale_check CHECK (locale IN ('en', 'sq', 'it'));
