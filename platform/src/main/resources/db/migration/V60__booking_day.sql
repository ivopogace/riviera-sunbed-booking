-- Per-day attendance: one booking_day row per service day of a stay, written when the booking
-- confirms. booking.status stays the contract state machine; COMPLETED / NO_SHOW are stay outcomes
-- written once, when the last service day resolves (docs/architecture/multi-night-stays.md, D2).
--
-- A service day is in one of three states -- unresolved, attended, missed -- carried by two
-- nullable stamps and the CHECK that forbids both. attended_at is stamped by the guarded check-in
-- UPDATE (a second scan on the same day matches 0 rows); missed_at by the no-show sweep for a day
-- that passed unattended. The service day itself is the business fact (the V41 point stands); a
-- stamp records that it was resolved, and when.
--
-- PRIMARY KEY (booking_id, service_date) is the uniqueness guard the model rests on and serves the
-- per-booking reads: "is any later day left?" and "was any day attended?". It also indexes the FK.
-- The partial index serves the sweep's candidate read over unresolved days, which every resolved
-- stay leaves, so it stays bounded by the live horizon like booking_confirmed_service_day_idx.
--
-- ON DELETE CASCADE: a service day is a child record of its booking, not an audit ledger (the V28
-- rationale); no production path deletes a booking row.
CREATE TABLE booking_day (
    booking_id   BIGINT      NOT NULL REFERENCES booking (id) ON DELETE CASCADE,
    service_date DATE        NOT NULL,                        -- a Europe/Tirane civil day (#6)
    attended_at  TIMESTAMPTZ,
    missed_at    TIMESTAMPTZ,
    CONSTRAINT booking_day_pkey          PRIMARY KEY (booking_id, service_date),
    CONSTRAINT booking_day_outcome_check CHECK (attended_at IS NULL OR missed_at IS NULL)
);

CREATE INDEX booking_day_unresolved_idx
    ON booking_day (service_date)
    WHERE attended_at IS NULL AND missed_at IS NULL;

-- The service days are written the moment a booking row becomes CONFIRMED, whichever statement
-- does it: the webhook confirm, the stub confirm, a fixture's direct insert. The trigger is the one
-- home of "written when the booking confirms", so no confirm path can forget them and no reader
-- has to treat a confirmed booking without days as a case. Until a booking carries a last day, its
-- range is the single booking_date. ON CONFLICT keeps a repeated confirm idempotent.
CREATE FUNCTION booking_day_materialise() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO booking_day (booking_id, service_date)
    VALUES (NEW.id, NEW.booking_date)
    ON CONFLICT (booking_id, service_date) DO NOTHING;
    RETURN NULL;
END;
$$;

CREATE TRIGGER booking_day_on_confirm
    AFTER INSERT OR UPDATE OF status ON booking
    FOR EACH ROW
    WHEN (NEW.status = 'CONFIRMED')
    EXECUTE FUNCTION booking_day_materialise();

-- Backfill: every booking that ever confirmed gets its one service day, resolved the way its status
-- says. A COMPLETED stay's day was attended at check-in (completed_at; the end of the service day
-- for a row older than V40); a NO_SHOW's day was missed once it ended. A confirmed booking that was
-- later cancelled keeps an unresolved day, exactly as one confirmed after this migration would.
INSERT INTO booking_day (booking_id, service_date, attended_at, missed_at)
SELECT id,
       booking_date,
       CASE WHEN status = 'COMPLETED' THEN COALESCE(completed_at, day_end) END,
       CASE WHEN status = 'NO_SHOW'   THEN day_end END
FROM (SELECT id, booking_date, status, completed_at,
             (booking_date + 1)::timestamp AT TIME ZONE 'Europe/Tirane' AS day_end
      FROM booking
      WHERE confirmed_at IS NOT NULL OR status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW')) ever_confirmed
ON CONFLICT (booking_id, service_date) DO NOTHING;
