-- Issue #388, ADR-0012: the suppression key is a peppered HMAC, never the address.
-- Supersedes V32's cleartext `email` column (that file is immutable; its "durable deliverability
-- record" posture is corrected HERE): the list deliberately survives right-to-erasure under
-- Art. 6(1)(f), so it must hold no cleartext PII. The table is empty in every environment
-- (only tests write it until the #370 bounce feed lands), so drop/recreate needs no data step.
--
-- email_key = 'v1:' || lower-hex HMAC-SHA-256(pepper, normalized address). The pepper is an
-- env-managed secret held outside the database (RIVIERA_SUPPRESSION_PEPPER, fail-at-boot in
-- prod); the 'v1:' scheme tag is the future-migration hook (#388 addendum — algorithm agility
-- without giving up the deterministic recompute-and-lookup design). The CHECK pins the exact
-- format so a hand-inserted cleartext address (or an unhashed feed write) can never satisfy the
-- schema, and UNIQUE doubles as the lookup index (V32 pattern). domain is the cleartext part
-- after '@' of the normalized address (a bare domain is not PII — ADR-0012), kept for
-- provider-level bounce triage, with V32's normalization CHECK carried over.

DROP TABLE email_suppression;

CREATE TABLE email_suppression
(
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_key           TEXT NOT NULL CHECK (email_key ~ '^v1:[0-9a-f]{64}$'),
  domain              TEXT NOT NULL CHECK (domain = lower(btrim(domain))),
  reason              TEXT NOT NULL CHECK (reason IN ('HARD_BOUNCE', 'COMPLAINT', 'MANUAL')),
  first_suppressed_at TIMESTAMPTZ NOT NULL,
  last_event_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT email_suppression_email_key_uq UNIQUE (email_key)
);
