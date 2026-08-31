-- #791 (epic #790): per-venue sales close on the service day itself (design spec §13).
-- Online sales for date D now run until D at this venue-local time (Europe/Tirane, invariant #6);
-- three fixed choices only. No application write path exists this slice (read-only setting;
-- creates take the DEFAULT, PATCH excludes it), so the CHECK is the sole validator until the
-- operator-control slice adds the mirroring edge validation. DEFAULT backfills every existing
-- venue to 16:00 — the maintainer-settled epic decision: same-day sales on by default, 00:01
-- the per-venue opt-out. Safe on existing rows (same argument as V22's DEFAULT).
-- Verified by SalesCloseMigrationIT.
ALTER TABLE venue
    ADD COLUMN sales_close TIME NOT NULL DEFAULT '16:00',
    ADD CONSTRAINT venue_sales_close_check
        CHECK (sales_close IN (TIME '00:01', TIME '16:00', TIME '23:59'));
