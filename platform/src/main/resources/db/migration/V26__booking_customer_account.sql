-- S3 (issue #114, epic #108): link a booking created while SIGNED IN to the customer ACCOUNT.
--
-- account_id is the CustomerAccountId (V25 customer_account.id), NULL for guest / signed-out
-- bookings — the guest checkout path is unchanged and never sets it (invariant #2/#4 flows
-- untouched). This is a SEPARATE link from customer_id (the guest-contact row, V5): a signed-in
-- booking still carries its guest contact (the name/phone the venue needs on arrival); account_id
-- is purely additive. No back-fill — existing bookings stay NULL; back-linking past guest bookings
-- by verified email is a later, #113-gated step (design D-6).
--
-- FK to customer_account for referential integrity (consistent with booking.customer_id -> customer,
-- V5). Default ON DELETE (RESTRICT): a customer account is never hard-deleted in v1, and a booking's
-- audit trail must not silently lose its owner. D-6 forbids a FK between the ACCOUNT and the guest
-- row; a booking -> account FK is a different, ordinary reference and is fine.
--
-- Partial index on the non-NULL slice backs "my bookings" (GET /api/me/bookings) — most bookings are
-- guest (NULL), so indexing only the signed-in slice keeps the index small (postgres skill).

ALTER TABLE booking
    ADD COLUMN account_id BIGINT REFERENCES customer_account (id);

CREATE INDEX booking_account_id_idx ON booking (account_id) WHERE account_id IS NOT NULL;
