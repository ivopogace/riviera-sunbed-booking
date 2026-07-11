-- #142: venue photos — operator upload + tourist display. Storage decision ADR-0008: resized,
-- EXIF-stripped, capped variants stored as Postgres bytea behind a swappable PhotoStorage port
-- (object storage + CDN deferred behind the port, past the ADR's flip threshold). TWO tables so the
-- blob never rides a metadata/list query (ADR-0008): venue_photo is the lean per-(venue, slot)
-- metadata; venue_photo_variant holds each per-surface rendered variant AND its bytea, read only on
-- the content-hash serving path. PKs are BIGINT identity (postgres skill — the unguessable credential
-- here is the content hash in the immutable serving URL, not the row id). CHECK over ENUM so the
-- slot/surface value sets stay easy to evolve (mirrors booking_mode / pool / amenity).

CREATE TABLE venue_photo (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id   BIGINT      NOT NULL REFERENCES venue (id) ON DELETE CASCADE,
    slot       TEXT        NOT NULL,                     -- COVER | SUNBEDS | BAR
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- TIMESTAMPTZ, never naked TIMESTAMP (invariant #6)
    CONSTRAINT venue_photo_slot_check CHECK (slot IN ('COVER', 'SUNBEDS', 'BAR')),
    -- at most one photo per (venue, slot): a re-upload REPLACES (delete-then-insert in the adapter)
    CONSTRAINT venue_photo_slot_uniq  UNIQUE (venue_id, slot)
);

-- Index the FK column — Postgres does not create this automatically (postgres skill).
CREATE INDEX venue_photo_venue_id_idx ON venue_photo (venue_id);

CREATE TABLE venue_photo_variant (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    photo_id     BIGINT      NOT NULL REFERENCES venue_photo (id) ON DELETE CASCADE,
    venue_id     BIGINT      NOT NULL REFERENCES venue (id) ON DELETE CASCADE,  -- denormalised: the venue-scoped serving lookup
    surface      TEXT        NOT NULL,                   -- CARD | BANNER | PREVIEW
    content_hash TEXT        NOT NULL,                   -- lower-case hex; the immutable-URL cache key + ETag (ADR-0008)
    content_type TEXT        NOT NULL,                   -- e.g. image/jpeg
    width        INTEGER     NOT NULL,
    height       INTEGER     NOT NULL,
    byte_size    INTEGER     NOT NULL,
    bytes        BYTEA       NOT NULL,                   -- the capped variant bytes; read ONLY on the serving path (never a list query)
    CONSTRAINT venue_photo_variant_surface_check CHECK (surface IN ('CARD', 'BANNER', 'PREVIEW')),
    CONSTRAINT venue_photo_variant_size_check    CHECK (byte_size >= 0),
    CONSTRAINT venue_photo_variant_dims_check    CHECK (width > 0 AND height > 0),
    -- one variant per (photo, surface)
    CONSTRAINT venue_photo_variant_surface_uniq  UNIQUE (photo_id, surface)
);

-- The serving lookup keys on (venue_id, content_hash) — a plain index, deliberately NOT unique:
-- the pipeline is deterministic, so the same source image uploaded to two slots of one venue
-- yields byte-identical PREVIEW variants with the same SHA-256, and both rows must coexist
-- (review finding #142 F-2). Duplicate (venue, hash) rows are content-identical by construction
-- (hash = SHA-256 of the bytes), so the serving read picks any one. The leading venue_id column
-- also indexes that FK + cascade.
CREATE INDEX venue_photo_variant_serving_idx ON venue_photo_variant (venue_id, content_hash);

-- Index the photo_id FK (join + cascade); it is not the leading column of any index above.
CREATE INDEX venue_photo_variant_photo_id_idx ON venue_photo_variant (photo_id);
