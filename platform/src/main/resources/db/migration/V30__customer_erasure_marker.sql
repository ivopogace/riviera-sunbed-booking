-- V30: GDPR right-to-erasure tombstone marker (Slice 1 of #101 [D5]).
--
-- Erasure = scrub-in-place, NEVER hard-delete. booking.customer_id (V5) and booking.account_id (V26) are
-- both ON DELETE RESTRICT because a booking is a financial/tax record subject to statutory retention
-- (invariant #9 — the payout ledger's auditability must not break). So a customer / customer_account row
-- that has bookings cannot be deleted; erasure instead tombstones its PII columns in place and deletes the
-- transient child rows (customer_sso_identity, customer_account_token).
--
-- erased_at marks a tombstoned row: NULL = live, non-NULL = erased. It is (a) the idempotency guard (every
-- scrub UPDATE is gated on erased_at IS NULL), (b) the accountability audit anchor, and (c) the anchor a
-- restore uses to re-apply erasures that post-dated a backup (documented in docs/runbooks/data-erasure.md).
-- This migration adds NO personal data — only the marker column. TIMESTAMPTZ per invariant #6.

ALTER TABLE customer         ADD COLUMN erased_at TIMESTAMPTZ;
ALTER TABLE customer_account ADD COLUMN erased_at TIMESTAMPTZ;
