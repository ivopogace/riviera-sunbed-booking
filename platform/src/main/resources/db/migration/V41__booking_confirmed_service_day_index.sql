-- The no-show sweep's candidate read: CONFIRMED bookings whose service day has already passed.
--
-- Partial on status, ordered by booking_date, exactly like the abandoned-payment (V13) and
-- request-expiry (V19) sweep indexes: the predicate keeps the index to the candidate rows and lets
-- the planner range-scan booking_date instead of seq-scanning a table that only grows.
--
-- Unlike those two, CONFIRMED is not obviously a transient state — until this sweep exists. Once it
-- does, a booking leaves CONFIRMED on its service day (checked in -> COMPLETED, or swept ->
-- NO_SHOW), so the index covers only live upcoming bookings and stays bounded by the booking
-- horizon rather than growing with history.
--
-- No table or column change: NO_SHOW has been admitted by booking_status_check since V5 (re-stated
-- V19/V37), and the transition stamps status alone -- as DECLINED/EXPIRED/WITHDRAWN do. There is no
-- no_show_at column on purpose: the business fact is "the service day passed", already stored as
-- booking_date, and a sweep timestamp would only record when the scheduler happened to run.

CREATE INDEX booking_confirmed_service_day_idx
    ON booking (booking_date)
    WHERE status = 'CONFIRMED';
