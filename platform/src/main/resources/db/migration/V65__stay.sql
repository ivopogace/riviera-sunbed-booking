-- A stitched stay is a GROUP of bookings, one per same-set stretch, each an ordinary booking with
-- its own set, span, price, accrual and refund (docs/architecture/multi-day-stays.md, D6; ADR-0024).
-- The group carries the guest-facing identity: ONE code, the bearer credential the guest presents
-- every morning (invariant #7), resolved to today's stretch at check-in. booking.code stays unique
-- per row (a stitched stretch gets a row code derived from the stay's, never shown), so every
-- per-booking path -- payment shares, payout entries, mails, receipts -- is untouched.
CREATE TABLE stay (
    id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        TEXT        NOT NULL,                              -- bearer credential (#7)
    venue_id    BIGINT      NOT NULL REFERENCES venue (id),
    first_date  DATE        NOT NULL,                              -- Europe/Tirane civil days (#6)
    last_date   DATE        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stay_code_uniq  UNIQUE (code),
    CONSTRAINT stay_span_check CHECK (last_date >= first_date)
);

CREATE INDEX stay_venue_id_idx ON stay (venue_id);

-- A booking that is a stretch of a stay names it; a lone booking has none. Postgres does not index
-- an FK column by itself, and the group read (view, cancel, check-in) walks stay -> bookings.
ALTER TABLE booking ADD COLUMN stay_id BIGINT REFERENCES stay (id);
CREATE INDEX booking_stay_id_idx ON booking (stay_id) WHERE stay_id IS NOT NULL;
