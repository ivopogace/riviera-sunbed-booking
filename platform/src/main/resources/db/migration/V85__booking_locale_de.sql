-- #1773: German joins shared.SiteLocale, so the language a guest books in may be 'de' (ADR-0030). The CHECK
-- lists SiteLocale's codes and moves with it (BookingLocaleIT stores each value). One statement, so the old
-- list never stands alone without the new; every existing row passes the wider list.
ALTER TABLE booking
    DROP CONSTRAINT booking_locale_check,
    ADD CONSTRAINT booking_locale_check CHECK (locale IN ('en', 'sq', 'it', 'de'));
