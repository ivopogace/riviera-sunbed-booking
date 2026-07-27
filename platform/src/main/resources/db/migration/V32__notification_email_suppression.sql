-- Issue #382: the notification module's first owned state — the do-not-mail (suppression) list.
-- Provider-agnostic in this slice: the table + the module-internal write path exist so the
-- Scaleway TEM bounce/complaint feed (epic #367 story 10, blocked on #370 provider setup) has
-- something to write into when it lands; until then rows arrive only via tests or manual ops.
--
-- The email is stored NORMALIZED (trimmed, lower-cased — the customer module's canonical form,
-- see JdbcCustomerDirectory) by the writing adapter, so the UNIQUE constraint doubles as the
-- lookup index for the send-time check and no functional index on lower(email) is needed.
-- Timestamps are UTC instants supplied by the application (invariant #6): first_suppressed_at
-- is set once, last_event_at refreshes on every repeat bounce/complaint (ON CONFLICT upsert).
-- Reason tokens are kept in lockstep with SuppressionReason (riviera-java-conventions §6a).
-- Rows are never deleted by the application: the list is a durable deliverability record.

CREATE TABLE email_suppression
(
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email               TEXT NOT NULL,
  reason              TEXT NOT NULL CHECK (reason IN ('HARD_BOUNCE', 'COMPLAINT', 'MANUAL')),
  first_suppressed_at TIMESTAMPTZ NOT NULL,
  last_event_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT email_suppression_email_uq UNIQUE (email)
);
