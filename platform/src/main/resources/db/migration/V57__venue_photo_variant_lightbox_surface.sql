-- A fourth rendition target: LIGHTBOX, the near-square modal viewer. Its 2200 x 1800 fit-within box
-- is DPR 2 over the lightbox's own painted maximum of 1100 x 900 CSS px, so a portrait upload is no
-- longer stretched from the 8:3 BANNER box. Stored at scale 1 only — the box already carries the
-- density, so a second scale on top of it would double-count.
--
-- Rows written before this migration have no LIGHTBOX variant, and it cannot be backfilled: the
-- full-res original is discarded at upload by design (ADR-0008), so a LIGHTBOX row only appears on
-- re-upload. The tourist read falls back to BANNER for a photo without one.
--
-- The surface CHECK is widened rather than replaced by an enum type: CHECK-over-ENUM is this
-- schema's settled shape for a vocabulary token. V56's UNIQUE (photo_id, surface, scale) already
-- admits the new row, and the serving index on (venue_id, content_hash) already covers its read.

ALTER TABLE venue_photo_variant
    DROP CONSTRAINT venue_photo_variant_surface_check;

ALTER TABLE venue_photo_variant
    ADD CONSTRAINT venue_photo_variant_surface_check
        CHECK (surface IN ('CARD', 'BANNER', 'LIGHTBOX', 'PREVIEW'));
