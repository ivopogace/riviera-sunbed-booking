-- #811 (epic #810): the review record — a checked-in tourist's 1-5 star verdict on one stay.
--
-- Owned by the new `review` module. One row per booking, ever: review_once_per_booking is the
-- idempotency guard the submit path claims against with INSERT ... ON CONFLICT DO NOTHING, so a
-- concurrent double-submit resolves in the database rather than in a read-then-write race (the
-- discipline invariant #2 mandates for availability, applied to this slice's own concurrency
-- point). Stars are bounded by CHECK rather than a native enum (TEXT+CHECK house style, JDBC-only
-- stack, invariant #1); the range is kept in lockstep with the Java submit validation.
--
-- Slice 1 ships only the columns slice 1 needs — comment, display name, moderation and erasure
-- state are later slices of #810 and arrive by forward migration (invariant #12).
-- Verified by ReviewMigrationIT.
CREATE TABLE review (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id BIGINT      NOT NULL REFERENCES booking (id),
    venue_id   BIGINT      NOT NULL REFERENCES venue (id),
    stars      INTEGER     NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,                 -- UTC instant (invariant #6)
    CONSTRAINT review_once_per_booking UNIQUE (booking_id),
    CONSTRAINT review_stars_check      CHECK (stars BETWEEN 1 AND 5)
);

-- booking_id lookups ride the UNIQUE index; the FK column venue_id needs its own (Postgres does
-- not create one) — it is the aggregate recompute's only access path.
CREATE INDEX review_venue_id_idx ON review (venue_id);

-- Supersede the V3 demo seed: from here on no venue carries rating values that did not come from
-- a recompute over real reviews (#811 AC-7). No real review exists yet, so every nonzero value in
-- the table is fabricated -- Miramar's 48/326 -- and leaving it would keep 326 invented reviews in
-- the denominator of the first real recompute. Zero reviews renders as "New", never "0.0".
UPDATE venue SET rating_tenths = 0, reviews_count = 0;
