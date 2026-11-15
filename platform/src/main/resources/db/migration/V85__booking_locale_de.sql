-- #1773: German joins shared.SiteLocale, so the language a guest books in and the one an operator's mail is
-- written in may be 'de' (ADR-0030). Both CHECKs list SiteLocale's codes and move with it (BookingLocaleIT and
-- OperatorLocaleIT store each value). One statement per table, so the old list never stands alone without the
-- new; every existing row passes the wider list.
ALTER TABLE booking
    DROP CONSTRAINT booking_locale_check,
    ADD CONSTRAINT booking_locale_check CHECK (locale IN ('en', 'sq', 'it', 'de'));

ALTER TABLE operator
    DROP CONSTRAINT operator_locale_check,
    ADD CONSTRAINT operator_locale_check CHECK (locale IN ('en', 'sq', 'it', 'de'));
