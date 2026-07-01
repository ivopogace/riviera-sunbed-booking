-- #73 (epic #72, item 01): the operator module — operator accounts + the operator↔venue
-- ownership mapping that backs per-venue authorization (invariant #13, BOLA / OWASP API #1).
-- JDBC-only stack (invariant #1); status as TEXT + CHECK, not a native ENUM.

CREATE TABLE operator (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username        TEXT        NOT NULL UNIQUE,
    status          TEXT        NOT NULL DEFAULT 'ACTIVE',
    -- Interim bridge (retired by #74): the single shared OPERATOR login maps to ONE bootstrap
    -- operator that owns every venue, so existing single-operator flows keep working while the
    -- real mapping + assertOwns + 403 are built and tested. A real per-operator account has this
    -- FALSE and owns venues via operator_venue rows.
    owns_all_venues BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT operator_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

-- operator ↔ venue ownership. A venue is owned by at most one operator (venue_id is the PK);
-- an operator owns many venues (indexed by operator_id for the ownedVenues read). FK to venue(id)
-- like payout_batch (V15) — a physical DB constraint, not a module import (operator's Java code
-- does not depend on venue::api; invariant #11 is satisfied via operator's own VenueRef).
CREATE TABLE operator_venue (
    venue_id    BIGINT NOT NULL PRIMARY KEY REFERENCES venue (id),
    operator_id BIGINT NOT NULL REFERENCES operator (id)
);
CREATE INDEX operator_venue_operator_idx ON operator_venue (operator_id);

-- The interim bootstrap operator. Username 'operator' matches the RivieraOperatorProperties
-- default, so the shared HTTP-Basic login resolves here. owns_all_venues = TRUE — NOT a
-- production posture without per-operator credentials (#74); it is the honest model of "one
-- shared identity legitimately reaches everything until operators are split".
INSERT INTO operator (username, status, owns_all_venues) VALUES ('operator', 'ACTIVE', TRUE);
