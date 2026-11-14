-- #1737: admin-issued operator password reset. An admin issues a single-use link for an ACTIVE operator
-- and hands it over out of band; the operator chooses the new password with it. The raw token is a
-- 256-bit bearer credential (invariant #7) that never lands here: only its deterministic SHA-256 hex
-- digest, so redemption can look it up by hash. Single-use (consumed_at) and expiring (expires_at);
-- issuing a new link and suspending the operator both consume the live one. Sole writer: `operator`.
CREATE TABLE operator_password_reset_token (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Transient child of the account, not a ledger: the token goes with its operator.
    operator_id  BIGINT      NOT NULL REFERENCES operator (id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT operator_password_reset_token_hash_uniq UNIQUE (token_hash)
);

-- One live link per operator: an issue retires the old token before inserting, under the operator row
-- lock; this index is the backstop.
CREATE UNIQUE INDEX operator_password_reset_token_one_live_idx
    ON operator_password_reset_token (operator_id) WHERE consumed_at IS NULL;

-- The FK, for the ON DELETE CASCADE scan (the partial index above covers live rows only).
CREATE INDEX operator_password_reset_token_operator_id_idx ON operator_password_reset_token (operator_id);
