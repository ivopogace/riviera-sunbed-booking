-- #276: an operator's linked Google/Apple sign-in. Link-only: a row is written only by a signed-in operator
-- who proved its current password, never by an SSO sign-in, so an unknown identity creates nothing.
-- Keyed on the OIDC issuer URL + subject (OIDC Core §5.7: `sub` is unique only per issuer). No email column:
-- an operator identity is never resolved or linked by email. Sole writer: `operator`.
CREATE TABLE operator_sso_identity (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- A transient child of the account, like its reset tokens: the link goes with its operator.
    operator_id  BIGINT      NOT NULL REFERENCES operator (id) ON DELETE CASCADE,
    issuer       TEXT        NOT NULL,
    subject      TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One external identity signs in as exactly one operator.
    CONSTRAINT operator_sso_identity_issuer_subject_uniq UNIQUE (issuer, subject),
    -- One link per provider per operator; leads with operator_id, so it also serves the FK and the list.
    CONSTRAINT operator_sso_identity_operator_issuer_uniq UNIQUE (operator_id, issuer)
);
