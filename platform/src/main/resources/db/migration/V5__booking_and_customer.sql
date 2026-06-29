-- U3 (issue #6): customer (guest checkout) + booking.
--
-- These are the demand-side write tables for the Instant-Book flow. The `booking` module
-- owns `booking`; the `customer` module owns `customer`. Both are JDBC-only (invariant #1):
-- explicit SQL via JdbcClient, no JPA/ORM.
--
-- IMPORTANT — uniqueness of (set, date) is NOT enforced here. The single source of truth
-- and the double-booking guard (invariant #2) is `set_availability.UNIQUE(set_id,
-- booking_date)` (V4). `booking` only INDEXES (set_id, booking_date): a set may have many
-- historical booking rows across the season (e.g. a cancelled booking then a new one for
-- the same date in U6), so a UNIQUE here would be wrong.
--
-- Money is BIGINT integer minor units + ISO currency (invariant #5) — never NUMERIC/float.
-- Timestamps are TIMESTAMPTZ (invariant #6). The booking `code` is the unguessable bearer
-- credential staff verify on arrival (invariant #7): UNIQUE, generated with entropy by the
-- application, never sequential. Status is TEXT + CHECK (postgres skill: easy to evolve,
-- fits the JDBC-only stack) rather than a native ENUM type.

CREATE TABLE customer (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      TEXT        NOT NULL,                 -- stored lower-cased; the guest key
    full_name  TEXT        NOT NULL,
    phone      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Guest checkout: a returning guest is matched by email (find-or-create), so email is
    -- the natural unique key. (No accounts/auth in v1.)
    CONSTRAINT customer_email_uniq UNIQUE (email)
);

CREATE TABLE booking (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            TEXT        NOT NULL,                 -- bearer credential (invariant #7)
    venue_id        BIGINT      NOT NULL REFERENCES venue (id),
    set_id          BIGINT      NOT NULL REFERENCES set_position (id),
    customer_id     BIGINT      NOT NULL REFERENCES customer (id),
    booking_date    DATE        NOT NULL,                 -- LocalDate in Europe/Tirane (#6)
    amount_minor    BIGINT      NOT NULL,                 -- integer minor units (#5)
    amount_currency TEXT        NOT NULL,                 -- ISO 4217
    status          TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,                          -- set when status -> CONFIRMED
    CONSTRAINT booking_code_uniq    UNIQUE (code),
    CONSTRAINT booking_status_check CHECK (status IN
        ('AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    CONSTRAINT booking_amount_check CHECK (amount_minor >= 0)
);

-- Index the FK / lookup columns — Postgres does not auto-create FK indexes (postgres skill).
-- (set_id, booking_date) is an INDEX, deliberately NOT a UNIQUE (see header note).
CREATE INDEX booking_set_date_idx    ON booking (set_id, booking_date);
CREATE INDEX booking_customer_id_idx ON booking (customer_id);
CREATE INDEX booking_venue_id_idx    ON booking (venue_id);
