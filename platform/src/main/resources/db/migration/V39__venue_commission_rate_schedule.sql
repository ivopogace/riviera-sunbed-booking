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
-- question "what rate applied on service date D".
--
-- FORWARD-ONLY by construction: the admin write schedules from TOMORROW in Europe/Tirane
-- (invariant #6), computed server-side; no request field can name an effective date, and there is
-- no statement anywhere that rewrites a past row or a ledger entry. Tomorrow rather than today
-- because invariant #4 closes a day's bookings the evening before, so today's bookings have all
-- already accrued — making a change effective today would be wrong by construction.
--
-- DELIBERATELY EMPTY AT MIGRATION, and there is no backfill. The table is a CHANGE LOG, not a
-- mirror: an empty schedule for a venue means "this rate has never changed", and the per-date read
-- answers that case from venue.commission_bps, which is exactly right. What makes the read total is
-- the WRITE, not this migration: a rate change first pins the rate it is superseding at the epoch
-- floor below (INSERT ... ON CONFLICT DO NOTHING, so only ever the first change writes it), then
-- moves the live rate, then schedules the new one. Every date is therefore covered from the moment
-- coverage could matter.
--
-- That placement is the point. A backfill here plus a seed on venue creation would make totality
-- depend on every present and future insert path cooperating — and it already does not: the ITs
-- insert venues with raw SQL, and nothing stops a future import or a manual fix from doing the
-- same. Pinning at write time needs no cooperation from whoever created the venue.

CREATE TABLE venue_commission_rate (
    venue_id       BIGINT      NOT NULL REFERENCES venue (id) ON DELETE CASCADE,
    effective_from DATE        NOT NULL,                   -- a SERVICE date (civil, Europe/Tirane) — DATE, not TIMESTAMPTZ
    commission_bps INTEGER     NOT NULL,                   -- basis points, exact integer (invariant #5)
    recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- TIMESTAMPTZ, never naked TIMESTAMP (invariant #6)
    -- One rate per (venue, effective date). Two idempotency guards ride this constraint: the floor
    -- pin (ON CONFLICT DO NOTHING — never overwrite the oldest rate we know of) and the schedule
    -- write (ON CONFLICT DO UPDATE — two admins acting the same day collapse to the last value).
    -- Its index also serves the read (WHERE venue_id = ? AND effective_from <= ?
    -- ORDER BY effective_from DESC LIMIT 1) on its leftmost prefix + range, so the FK column needs
    -- no second index (postgres skill: don't duplicate an index a constraint already provides).
    PRIMARY KEY (venue_id, effective_from),
    -- Mirrors venue_commission_bps_check (V2) — the race-safe backstop behind
    -- VenueFieldValidation.requireCommissionBps (invariant #12).
    CONSTRAINT venue_commission_rate_bps_check CHECK (commission_bps BETWEEN 0 AND 10000)
);
