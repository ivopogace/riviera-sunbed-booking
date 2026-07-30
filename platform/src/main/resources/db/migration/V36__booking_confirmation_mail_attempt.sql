-- V36 (#380, Email S9): what the platform actually DID about each booking-confirmation mail,
-- recorded at send time — the record a support agent reads when a tourist says "I never got it".
--
-- WHY A TABLE AND NOT THE EVENT PUBLICATION REGISTRY. The obvious-looking source is the registry:
-- `event_publication.completion_date` is stamped when the confirmation listener returns, and
-- `completion-mode=archive` keeps the row. But that column records only that the listener RETURNED,
-- which it also does when the address is suppressed and the send is deliberately skipped (#382), and
-- when the mail is abandoned for a missing booking/set/contact (#428). A registry-derived view would
-- therefore report "dispatched 14:02" for a mail that never left — wrong in exactly the cases support
-- phones about. `booking.spi.ConfirmationMailDelivery` already states the rule this table follows:
-- a consumer that needs the historical fact records it at send time instead of inferring it.
-- Two further reasons: `event_publication` is framework-owned schema this project has already had to
-- rewrite twice (V18, V31), and finding rows by booking id there needs a JSON expression index over
-- `serialized_event`, which would constrain every event type sharing that table.
--
-- NO recipient address and NO arrival code, ever. The address stays inside `customer` (ADR-0010
-- erasure reach: pseudonymize-in-place cannot reach a copy kept here), and the code is a bearer
-- credential (invariant #7). The booking id is the only key this log needs; the admin surface resolves
-- an address through `customer::api` at display time and never renders the code.
--
-- NAMED FOR THE ONE KIND IT RECORDS. A `mail_kind` column populated with a single value would make
-- "no cancellation attempts" indistinguishable from "cancellation attempts were never recorded" — an
-- absence that lies. A later slice that records the cancellation (#374) or payment-due (#373) mail
-- generalises this table in the same slice as its write site, so the absence stays honest.
CREATE TABLE booking_confirmation_mail_attempt
(
    id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Plain FK in the house style (payout_ledger_entry.booking_id); deliberately NO ON DELETE
    -- CASCADE — nothing deletes a booking, and an attempt row outliving its booking would be a lie.
    booking_id     BIGINT      NOT NULL REFERENCES booking (id),
    -- Tokens are the Java enum constants' names (MailAttemptSource / MailAttemptOutcome); the
    -- lockstep is pinned by ConfirmationMailAttemptsIT, which inserts every constant.
    trigger_source TEXT        NOT NULL CHECK (trigger_source IN ('AUTOMATIC', 'ADMIN_RESEND')),
    outcome        TEXT        NOT NULL CHECK (outcome IN ('SENT', 'WITHHELD_SUPPRESSED',
                                                          'TRANSPORT_FAILED', 'ABANDONED_MISSING_FACTS')),
    attempted_at   TIMESTAMPTZ NOT NULL                   -- UTC instant (invariant #6)
);

-- The only query shape this table has: the history for one or more bookings, newest first. Postgres
-- creates no index for a FK column, and this composite serves the FK lookup and the ordering at once.
CREATE INDEX booking_confirmation_mail_attempt_booking_idx
    ON booking_confirmation_mail_attempt (booking_id, attempted_at DESC);

-- DELIBERATELY NO UNIQUE CONSTRAINT. Two admins pressing Resend at the same moment really did make
-- two attempts, and a retried automatic send really is a second attempt; an attempt log that rejects
-- a duplicate attempt is a log that lies. Idempotency is not this table's job — the Event Publication
-- Registry owns it for the automatic path (#371), and a resend is a deliberate duplicate send.
