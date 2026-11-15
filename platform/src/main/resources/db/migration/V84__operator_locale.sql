-- #1785: the language an operator registered from or last picked in the console (ADR-0030), so the
-- approval notice is written in it. NULL for a row from before this column: it reads as English, the
-- source locale, so no backfill. The CHECK lists shared.SiteLocale's codes and moves with it
-- (OperatorLocaleIT stores each value). A nullable ADD COLUMN without a default is metadata-only.
ALTER TABLE operator ADD COLUMN locale TEXT;

ALTER TABLE operator ADD CONSTRAINT operator_locale_check CHECK (locale IN ('en', 'sq', 'it'));
