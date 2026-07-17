-- S4 (#112, epic #108): SSO identity linkage for customer accounts — "Continue with Google/Apple".
--
-- Maps an external (provider, subject) — the OIDC issuer's stable subject id — to a customer_account
-- (V25). The account identity stays SEPARATE from the guest `customer` contact row (design D-6): this
-- table FKs only to customer_account, never to the guest row. First SSO sign-in for an unknown
-- (provider, subject) resolves-or-creates the account by verified email — auto-linking to an existing
-- account when the email is already taken (maintainer decision 2026-07-17) — and links the identity; a
-- returning subject reuses its linked account.
--
-- provider is TEXT + CHECK, not a native ENUM (postgres skill / invariant #6a in lockstep with the
-- Java SsoProvider constants). subject/email are the issuer-asserted values; email is kept for AUDIT
-- only — resolution uses customer_account.email, not this column. UNIQUE(provider, subject) makes one
-- external identity map to exactly one account and backs the returning-subject lookup; the account_id
-- FK is indexed explicitly (Postgres does not auto-index foreign keys). TIMESTAMPTZ per invariant #6.

CREATE TABLE customer_sso_identity (
    id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id  BIGINT      NOT NULL REFERENCES customer_account (id),
    provider    TEXT        NOT NULL CHECK (provider IN ('GOOGLE', 'APPLE')),
    subject     TEXT        NOT NULL,
    email       TEXT        NOT NULL,                 -- provider-asserted email at link time (audit only)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_sso_identity_provider_subject_uniq UNIQUE (provider, subject)
);

CREATE INDEX customer_sso_identity_account_id_idx ON customer_sso_identity (account_id);

-- SSO-only accounts have no local password. Relax the V25 NOT NULL so find-or-create can insert a
-- password-less account; the credential read (CustomerAccounts.findByEmail) filters out null-hash rows,
-- so an SSO-only account simply has no password login (the generic 401, non-enumeration D-8). A password
-- account that later gains an SSO link keeps its hash and can still log in either way.
ALTER TABLE customer_account ALTER COLUMN password_hash DROP NOT NULL;
