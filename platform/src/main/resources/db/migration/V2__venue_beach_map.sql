-- U1 (issue #4): venue + beach-map read model.
--
-- Supply read side, owned by the `venue` module. Primary keys are BIGINT identity
-- (per the postgres skill — random UUIDv4 PKs fragment indexes and cost more on joins;
-- the unguessable credential in this system is the booking code, invariant #7, not the
-- venue/set id). Money is integer minor units + ISO currency (invariant #5). CHECK
-- constraints are used over ENUM types so the value set is easy to evolve.
--
-- NOTE: U1 does NOT create the authoritative availability(set_id, booking_date) table —
-- that concurrency-critical source of truth and its UNIQUE constraint + claim are U2
-- (issue #5). The `seed_availability` column here is a seed-only placeholder so the
-- read-only map can render free/taken; U2 replaces the read source without changing the API.

CREATE TABLE venue (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            TEXT        NOT NULL,
    beach           TEXT        NOT NULL,
    region          TEXT        NOT NULL,
    description     TEXT,
    rating_tenths   INTEGER     NOT NULL DEFAULT 0,   -- 4.8 stored as 48 (no floating point)
    reviews_count   INTEGER     NOT NULL DEFAULT 0,
    booking_mode    TEXT        NOT NULL,             -- INSTANT | REQUEST
    commission_bps  INTEGER     NOT NULL,             -- basis points, exact integer (invariant #5)
    payout_currency TEXT        NOT NULL,             -- ISO 4217
    booking_cutoff  TIME        NOT NULL DEFAULT '18:00',  -- Europe/Tirane local time (invariant #4)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- TIMESTAMPTZ, never naked TIMESTAMP (invariant #6)
    CONSTRAINT venue_booking_mode_check   CHECK (booking_mode IN ('INSTANT', 'REQUEST')),
    CONSTRAINT venue_rating_tenths_check  CHECK (rating_tenths BETWEEN 0 AND 50),
    CONSTRAINT venue_reviews_count_check  CHECK (reviews_count >= 0),
    CONSTRAINT venue_commission_bps_check CHECK (commission_bps BETWEEN 0 AND 10000)
);

CREATE TABLE set_position (
    id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id          BIGINT      NOT NULL REFERENCES venue (id) ON DELETE CASCADE,
    row_label         TEXT        NOT NULL,
    position_no       INTEGER     NOT NULL,
    tier              TEXT        NOT NULL,           -- PREMIUM | STANDARD
    pool              TEXT        NOT NULL,           -- ONLINE | WALK_IN
    price_minor       BIGINT      NOT NULL,           -- integer minor units (invariant #5)
    price_currency    TEXT        NOT NULL,           -- ISO 4217
    grid_x            INTEGER     NOT NULL,           -- column 1..6 (render position)
    grid_y            INTEGER     NOT NULL,           -- row 1..4 (render position)
    seed_availability TEXT        NOT NULL DEFAULT 'FREE',  -- FREE | TAKEN (U1 seed-only; U2 owns the real table)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT set_position_tier_check  CHECK (tier IN ('PREMIUM', 'STANDARD')),
    CONSTRAINT set_position_pool_check  CHECK (pool IN ('ONLINE', 'WALK_IN')),
    CONSTRAINT set_position_avail_check CHECK (seed_availability IN ('FREE', 'TAKEN')),
    CONSTRAINT set_position_price_check CHECK (price_minor >= 0),
    -- layout constraint (invariant #12): one set per grid cell. NOT the availability guard.
    CONSTRAINT set_position_cell_uniq   UNIQUE (venue_id, row_label, position_no)
);

-- Index the FK column — Postgres does not create this automatically (postgres skill).
CREATE INDEX set_position_venue_id_idx ON set_position (venue_id);
