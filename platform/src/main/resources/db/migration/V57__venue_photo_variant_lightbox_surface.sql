-- A fourth rendition target: LIGHTBOX, the near-square modal viewer. Its 2200 x 1800 fit-within box
-- is DPR 2 over that viewer's painted maximum of 1100 x 900 CSS px, which the 8:3 BANNER box cannot
-- carry for a tall upload. Stored at scale 1 only — the box already carries the density, so a
-- second scale on top of it would double-count.
--
-- A LIGHTBOX row exists only for an upload large enough to fill that box: a smaller one is skipped
-- rather than upscaled, exactly as the retina tier is. Rows written before this migration have none
-- and cannot gain one without a re-upload, since the full-res original is discarded at upload
-- (ADR-0008). The tourist read falls back to BANNER for any photo without one.
--
-- The admitted set is widened rather than replaced by an enum type: CHECK-over-ENUM is this
-- schema's settled shape for a vocabulary token. Postgres runs a migration in one transaction, so
-- dropping the CHECK before re-adding it leaves no window a writer could see (V56 had to order its
-- UNIQUE swap the other way round — an index build, not a constraint two statements can replace).
-- V56's UNIQUE (photo_id, surface, scale) already admits the new row, and the serving index on
-- (venue_id, content_hash) already covers its read — deliberately non-unique, which is what lets
-- BANNER@2 and LIGHTBOX@1 share a hash where their boxes coincide (a 2.29:1 upload).

ALTER TABLE venue_photo_variant
    DROP CONSTRAINT venue_photo_variant_surface_check;

ALTER TABLE venue_photo_variant
    ADD CONSTRAINT venue_photo_variant_surface_check
        CHECK (surface IN ('CARD', 'BANNER', 'LIGHTBOX', 'PREVIEW'));
