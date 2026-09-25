-- The venue's maximum stay length in days (design D10, docs/architecture/multi-day-stays.md):
-- NULL means any length this season; the platform sets no maximum of its own. Owner-editable
-- through the profile PATCH; the reserve path refuses a longer stay before any claim.
-- Verified by MaxStayDaysMigrationIT.
ALTER TABLE venue
    ADD COLUMN max_stay_days INTEGER,
    ADD CONSTRAINT venue_max_stay_days_check
        CHECK (max_stay_days IS NULL OR max_stay_days >= 1);
