-- V38 (#507): the platform-admin audit trail ADR-0013 requires — who did what, to what, when,
-- and (when offered) on what grounds, for every mutating /api/admin/** action that reached past
-- the security gate. Until this table every admin surface acted silently; report-and-remove
-- moderation without an attributable record is just remove (ADR-0013's own wording).
--
-- ACTOR IS A USERNAME SNAPSHOT, DELIBERATELY NO FK. The record must state what was true at act
-- time; an operator row's later lifecycle (suspension, rename, erasure) must never mutate or
-- cascade into history. Operators are not data subjects of ADR-0010's scrub, and #507 defers the
-- retention question explicitly (Phase-1 indefinite, a named non-goal).
--
-- METHOD/PATH ARE RECORDED FACTS, NOT VOCABULARY — no CHECK constraints. A CHECK would turn a
-- routing change (a new admin surface, a renamed path) into a migration on the audit table, and
-- an audit log that rejects what actually happened is a log that lies (the V36 reasoning).
--
-- DELIBERATELY NO UNIQUE CONSTRAINT. Two identical actions really did happen twice; append-only.
-- Tamper-evidence (append-only enforcement, hash chaining) is a named #507 non-goal.
CREATE TABLE admin_audit_record
(
    id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor       TEXT        NOT NULL,               -- authenticated principal's username at act time
    method      TEXT        NOT NULL,               -- HTTP method of the recorded action
    path        TEXT        NOT NULL,               -- the /api/admin/** path; target ids ride in it
    status      INTEGER     NOT NULL,               -- the response status the action answered
    reason      TEXT,                               -- optional sanitized X-Audit-Reason (<=500 chars)
    occurred_at TIMESTAMPTZ NOT NULL                -- UTC instant (invariant #6)
);

-- The only query shape this table has today: the latest N actions, newest first, tie-broken by id
-- (two actions can share a timestamp); the index serves exactly that ORDER BY ... LIMIT.
CREATE INDEX admin_audit_record_occurred_idx
    ON admin_audit_record (occurred_at DESC, id DESC);
