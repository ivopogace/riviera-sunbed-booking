-- A booking gains an end date. booking_date keeps its meaning -- the FIRST service day -- and
-- last_date is the last one, inclusive; a one-day booking has the two equal. Every row that exists
-- is backfilled to exactly that, so every predicate written against booking_date stays literally
-- true until it is moved to the span on purpose (docs/architecture/multi-day-stays.md, D3).
--
-- set_availability does not change: a stay is one (set, date) row per service day, claimed through
-- the same port as today, and UNIQUE (set_id, booking_date) guards each of them (invariant #2).
ALTER TABLE booking ADD COLUMN last_date DATE;                     -- a Europe/Tirane civil day (#6)
UPDATE booking SET last_date = booking_date;
ALTER TABLE booking ALTER COLUMN last_date SET NOT NULL;
ALTER TABLE booking ADD CONSTRAINT booking_span_check CHECK (last_date >= booking_date);

-- An insert that names no last day is a one-day booking -- the same rule as the backfill, stated
-- once for every writer: the application binds it, a fixture or a hand insert need not. A BEFORE
-- trigger fills it ahead of the NOT NULL check.
CREATE FUNCTION booking_last_date_default() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.last_date := NEW.booking_date;
    RETURN NEW;
END;
$$;

CREATE TRIGGER booking_last_date_on_insert
    BEFORE INSERT ON booking
    FOR EACH ROW
    WHEN (NEW.last_date IS NULL)
    EXECUTE FUNCTION booking_last_date_default();

-- V60's confirm trigger, widened to the span: one service day per day from the first to the last,
-- still idempotent on a repeated confirm. The trigger binding (booking_day_on_confirm) is unchanged.
CREATE OR REPLACE FUNCTION booking_day_materialise() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO booking_day (booking_id, service_date)
    SELECT NEW.id, day::date
    FROM generate_series(NEW.booking_date, NEW.last_date, INTERVAL '1 day') AS day
    ON CONFLICT (booking_id, service_date) DO NOTHING;
    RETURN NULL;
END;
$$;
