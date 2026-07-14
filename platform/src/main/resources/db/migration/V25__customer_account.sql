-- S2 (#111, epic #108): customer accounts — register + sign-in for tourists.
--
-- A customer ACCOUNT is a SEPARATE identity from the guest-checkout `customer` contact row
-- (V5): there is deliberately NO foreign key between them. Registration must never auto-claim
-- a guest email's past bookings — linking is a deliberate, email-verified step (design D-6,
-- shipped in S3/S8). Keeping the account keyed by its own id (not the guest CustomerId) makes
-- that boundary structural rather than a runtime check someone can forget.
--
-- Mirrors the operator identity store (V16/V17): the `password_hash` is an opaque TEXT blob the
-- `customer` module stores; the platform edge encodes/verifies it (RV-BE-11, invariant #1 — the
-- module imports no Spring Security type). Unlike operator's nullable hash, this column is
-- NOT NULL: a customer account is created BY registration, so it always has a hash.
--
-- Email is stored lower-cased + trimmed by the application (matching the guest `customer` key),
-- so the UNIQUE constraint both prevents duplicate accounts (one account per email) and backs the
-- findByEmail lookup — no separate index needed. No status/verification column here: S8 adds
-- email-verification state. TIMESTAMPTZ per invariant #6; status-style columns as TEXT (no native
-- ENUM) per the postgres skill, though none is needed yet.

CREATE TABLE customer_account (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT        NOT NULL,                 -- stored lower-cased + trimmed
    password_hash TEXT        NOT NULL,                 -- opaque {bcrypt} blob (invariant #7 posture)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_account_email_uniq UNIQUE (email)
);
