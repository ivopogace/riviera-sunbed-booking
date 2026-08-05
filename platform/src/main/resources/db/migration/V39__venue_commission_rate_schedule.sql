-- A7 (epic #348): the venue commission-rate SCHEDULE — which rate applied to which service dates.
--
-- Owned by the `venue` module (it stores the rate; `payout` computes with it). Exists to stop the
-- operator console's daily-takings strip from re-splitting PAST service dates at a newly changed
-- rate: before this table, DailyTakingsService read the live venue.commission_bps at query time, so
-- a rate change silently repriced every past day's figure while payout_ledger_entry kept the
-- commission_minor it accrued (invariant #9 — history is never repriced, past statements stay as
-- sent).
--
-- venue.commission_bps STAYS the live rate and stays the single source for decisions made NOW: the
-- accrual listener re-reads it at accrual time, unchanged. This table answers the different
-- question "what rate applied on service date D". A write sets both, with the SAME bps value — they
-- differ only in WHICH DATES the value governs, never in value.
--
-- FORWARD-ONLY by construction: the admin write schedules from TOMORROW in Europe/Tirane
-- (invariant #6), computed server-side; no request field can name an effective date, and there is
-- no statement anywhere that rewrites a past row or a ledger entry. Tomorrow rather than today
-- because invariant #4 closes a day's bookings the evening before, so today's bookings have all
-- already accrued — making a change effective today would be wrong by construction.
--
-- The schedule is TOTAL, which is what makes the per-date read safe: every venue gets a row at the
-- epoch floor below (backfilled here, seeded by JdbcVenues#insertVenue for new venues), so the
-- "latest row at or before D" lookup always finds one for any real service date and can never fall
-- through to the live rate for a past day — the exact bug this table fixes.

CREATE TABLE venue_commission_rate (
    venue_id       BIGINT      NOT NULL REFERENCES venue (id) ON DELETE CASCADE,
    effective_from DATE        NOT NULL,                   -- a SERVICE date (civil, Europe/Tirane) — DATE, not TIMESTAMPTZ
    commission_bps INTEGER     NOT NULL,                   -- basis points, exact integer (invariant #5)
    recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- TIMESTAMPTZ, never naked TIMESTAMP (invariant #6)
    -- One rate per (venue, effective date). Also the idempotency target: two writes on the same day
    -- collapse onto this row via ON CONFLICT DO UPDATE, last writer wins, no duplicate schedule.
    -- The composite PK's index serves the read (WHERE venue_id = ? AND effective_from <= ?
    -- ORDER BY effective_from DESC LIMIT 1) on its leftmost prefix + range, so the FK column needs
    -- no second index (postgres skill: don't duplicate an index a constraint already provides).
    PRIMARY KEY (venue_id, effective_from),
    -- Mirrors venue_commission_bps_check (V2) — the race-safe backstop behind
    -- VenueFieldValidation.requireCommissionBps (invariant #12).
    CONSTRAINT venue_commission_rate_bps_check CHECK (commission_bps BETWEEN 0 AND 10000)
);

-- Backfill: every existing venue's current rate, from the epoch floor. Truthful, not a placeholder —
-- no venue's rate has ever changed (there was no endpoint that could change it), so its current rate
-- IS the rate that applied to all of its history. 1970-01-01 predates the platform, so it covers
-- every service date a booking could carry.
INSERT INTO venue_commission_rate (venue_id, effective_from, commission_bps)
SELECT id, DATE '1970-01-01', commission_bps FROM venue;
