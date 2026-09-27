-- ADR-0025 (issue #1264): a pending request is not a hold. From here a PENDING_REQUEST row claims
-- no set_availability row; the venue's accept claims every day of the request, and decline, expiry,
-- withdrawal and a remodel's decline touch availability not at all.
--
-- decline_reason: why a request ended DECLINED -- the venue's own no (VENUE), a day the accept could
-- not claim or a set a remodel disturbed (SET_UNAVAILABLE), or an overlapping request on the same set
-- accepted instead (ANOTHER_GUEST). TEXT + CHECK (invariant #1), kept in lockstep with the Java
-- DeclineReason enum by BookingMigrationIT.everyDeclineReasonAccepted. A reason may sit only on a
-- DECLINED row; a DECLINED row with none (a hand insert, a fixture) reads as VENUE.
ALTER TABLE booking ADD COLUMN decline_reason TEXT NULL;
ALTER TABLE booking ADD CONSTRAINT booking_decline_reason_check
    CHECK (decline_reason IS NULL OR decline_reason IN ('VENUE', 'SET_UNAVAILABLE', 'ANOTHER_GUEST'));
ALTER TABLE booking ADD CONSTRAINT booking_decline_reason_only_when_declined
    CHECK (decline_reason IS NULL OR status = 'DECLINED');
UPDATE booking SET decline_reason = 'VENUE' WHERE status = 'DECLINED';

-- Every request pending at this moment holds the rows the old model claimed for it. The termination
-- legs stop releasing with this deploy, so the rows are freed here or never: set_availability has no
-- link to a booking (V4), and a pending request was the sole holder of its (set, day) rows, so the
-- join names exactly them.
DELETE FROM set_availability sa
USING booking b
WHERE b.status = 'PENDING_REQUEST'
  AND sa.set_id = b.set_id
  AND sa.booking_date BETWEEN b.booking_date AND b.last_date
  AND sa.state = 'BOOKED_ONLINE';
