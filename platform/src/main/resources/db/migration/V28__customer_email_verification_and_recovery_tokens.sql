-- V28: Email verification + account recovery tokens (S8, issue #113, epic #108).
--
-- Adds soft (non-blocking) email-verification state to the customer account and an account-tied
-- recovery-token table backing email verification + password reset. Email verification gates NOTHING
-- functional in v1 -- guest-mode bookings are never back-linked (maintainer decision 2026-07-17;
-- design D-6 amended). The flag is informational (a "please verify" nudge + email-ownership/anti-spam
-- trust). Tokens are bearer credentials (invariant #7): stored as an opaque deterministic SHA-256
-- digest, single-use, expiring. JDBC-only (invariant #1); TIMESTAMPTZ per invariant #6; status column
-- as TEXT + CHECK, never a native enum (postgres skill).

ALTER TABLE customer_account ADD COLUMN email_verified    BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE customer_account ADD COLUMN email_verified_at TIMESTAMPTZ;

-- SSO-linked accounts were verified by the identity provider (design D-6) -- grandfather them to verified.
UPDATE customer_account ca
   SET email_verified = true, email_verified_at = NOW()
 WHERE EXISTS (SELECT 1 FROM customer_sso_identity si WHERE si.account_id = ca.id);

-- Account recovery tokens (email verification + password reset). The raw token is a high-entropy bearer
-- credential emailed in the link; only its SHA-256 hex digest lands here, so the consume path can look
-- it up by hash (a deterministic digest -- NOT bcrypt, which salts per row and could not be queried).
-- Single-use (consumed_at) + expiring (expires_at), enforced by one atomic UPDATE ... RETURNING at
-- redemption: invalid, expired, and already-used tokens are indistinguishable (zero rows -- D-8).
CREATE TABLE customer_account_token (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- ON DELETE CASCADE: recovery tokens are transient child records of the account (not an audit
    -- ledger), so deleting an account takes its tokens with it (also future-proofs GDPR erasure).
    account_id   BIGINT      NOT NULL REFERENCES customer_account (id) ON DELETE CASCADE,
    purpose      TEXT        NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
    token_hash   TEXT        NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_account_token_hash_uniq UNIQUE (token_hash)
);

-- Index the FK (Postgres does not auto-create it): used to invalidate an account's prior unconsumed
-- tokens of a purpose when a new one is issued.
CREATE INDEX customer_account_token_account_id_idx ON customer_account_token (account_id);
