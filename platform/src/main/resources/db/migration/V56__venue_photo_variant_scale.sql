-- A retina tier for the tourist photo surfaces. A rendition is keyed by (photo, surface, scale)
-- rather than (photo, surface): CARD and BANNER each carry a scale-1 and a scale-2 row, so the
-- tourist read model can publish both as srcset candidates and the browser picks the one that fits
-- its rendered box. PREVIEW (the operator console slot) stays scale 1.
--
-- Rows written before this migration are scale 1. They cannot be backfilled: the full-res original
-- is discarded at upload by design (ADR-0008), so a scale-2 row only appears on re-upload, and a
-- pre-existing photo publishes a one-candidate srcset until then.
--
-- SMALLINT over an enum/CHECK-of-text because the value is a density multiplier the read model
-- multiplies by, not a vocabulary token; the CHECK still pins the admitted set.

ALTER TABLE venue_photo_variant
    ADD COLUMN scale SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE venue_photo_variant
    ADD CONSTRAINT venue_photo_variant_scale_check CHECK (scale IN (1, 2));

-- The widened uniqueness lands BEFORE the old one is dropped, so the table is never a moment
-- without a constraint rejecting a duplicate rendition.
ALTER TABLE venue_photo_variant
    ADD CONSTRAINT venue_photo_variant_surface_scale_uniq UNIQUE (photo_id, surface, scale);

ALTER TABLE venue_photo_variant
    DROP CONSTRAINT venue_photo_variant_surface_uniq;
