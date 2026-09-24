-- Per-night attendance: one booking_night row per night of a stay, written when the booking
-- confirms. booking.status stays the contract state machine; COMPLETED / NO_SHOW are stay outcomes
-- written once, when the last night resolves (docs/architecture/multi-night-stays.md, D2).
--
-- A night is in one of three states -- unresolved, attended, missed -- carried by two nullable
-- stamps and the CHECK that forbids both. attended_at is stamped by the guarded check-in UPDATE (a
-- second scan on the same night matches 0 rows); missed_at by the no-show sweep for a night that
-- passed unattended. The night itself is the business fact (the V41 point stands); a stamp records
-- that the night was resolved, and when.
--
-- PRIMARY KEY (booking_id, night) is the uniqueness guard the model rests on and serves the
-- per-booking reads: "is any later night left?" and "was any night attended?". It also indexes the
-- FK. The partial index serves the sweep's candidate read over unresolved nights, which every
-- resolved stay leaves, so it stays bounded by the live horizon like booking_confirmed_service_day_idx.
--
-- ON DELETE CASCADE: a night is a child record of its booking, not an audit ledger (the V28
-- rationale); no production path deletes a booking row.
CREATE TABLE booking_night (
    booking_id  BIGINT      NOT NULL REFERENCES booking (id) ON DELETE CASCADE,
    night       DATE        NOT NULL,                         -- a Europe/Tirane civil day (#6)
    attended_at TIMESTAMPTZ,
    missed_at   TIMESTAMPTZ,
    CONSTRAINT booking_night_pkey          PRIMARY KEY (booking_id, night),
    CONSTRAINT booking_night_outcome_check CHECK (attended_at IS NULL OR missed_at IS NULL)
);

CREATE INDEX booking_night_unresolved_idx
    ON booking_night (night)
    WHERE attended_at IS NULL AND missed_at IS NULL;

-- The nights are written the moment a booking row becomes CONFIRMED, whichever statement does it:
-- the webhook confirm, the stub confirm, a fixture's direct insert. The trigger is the one home of
-- "written when the booking confirms", so no confirm path can forget them and no reader has to
-- treat a confirmed booking without nights as a case. Until a booking carries a last night, its
-- range is the single booking_date. ON CONFLICT keeps a repeated confirm idempotent.
CREATE FUNCTION booking_night_materialise() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO booking_night (booking_id, night)
    VALUES (NEW.id, NEW.booking_date)
    ON CONFLICT (booking_id, night) DO NOTHING;
    RETURN NULL;
END;
$$;

CREATE TRIGGER booking_night_on_confirm
    AFTER INSERT OR UPDATE OF status ON booking
    FOR EACH ROW
    WHEN (NEW.status = 'CONFIRMED')
    EXECUTE FUNCTION booking_night_materialise();

-- Backfill: every booking that ever confirmed gets its one night, resolved the way its status says.
-- A COMPLETED stay's night was attended at check-in (completed_at; the end of the service day for a
-- row older than V40); a NO_SHOW's night was missed once its day ended. A confirmed booking that was
-- later cancelled keeps an unresolved night, exactly as one confirmed after this migration would.
INSERT INTO booking_night (booking_id, night, attended_at, missed_at)
SELECT id,
       booking_date,
       CASE WHEN status = 'COMPLETED' THEN COALESCE(completed_at, day_end) END,
       CASE WHEN status = 'NO_SHOW'   THEN day_end END
FROM (SELECT id, booking_date, status, completed_at,
             (booking_date + 1)::timestamp AT TIME ZONE 'Europe/Tirane' AS day_end
      FROM booking
      WHERE confirmed_at IS NOT NULL OR status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW')) ever_confirmed
ON CONFLICT (booking_id, night) DO NOTHING;
