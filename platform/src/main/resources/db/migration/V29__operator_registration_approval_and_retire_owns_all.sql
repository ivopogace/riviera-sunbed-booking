-- #115 (epic #108, S6): operator self-registration → admin approval → creator-owns-on-create,
-- and the retirement of the owns-all bootstrap operator (#74 follow-up).
--
-- Four changes, in a data-safe order (backfill BEFORE the drop so no venue is orphaned):
--   1. Registration/approval state — widen the status CHECK with PENDING and REJECTED. A freshly
--      self-registered operator is PENDING (cannot authenticate); an admin flips it to ACTIVE
--      (login enabled) or REJECTED (terminal). Only ACTIVE resolves to an OperatorId / can own venues.
--   2. contact_email — informational for the admin's approval decision (not a login key, not unique,
--      not verified; operators are admin-gated, so no email-verification flow like the customer side).
--   3. is_admin — the platform-admin authority. The edge maps it to ROLE_ADMIN for the role-gated
--      /api/admin/** approval surface (invariant #13 exemption); the operator module stores it as an
--      opaque flag and imports no Spring Security (RV-BE-11). The bootstrap 'operator' is the admin.
--   4. Retire owns_all_venues — no account owns all venues anymore. Before dropping the column, make
--      the bootstrap's implicit ownership explicit: every currently-unowned venue (Miramar from V3,
--      plus anything created via POST /api/venues before this migration — which wrote no ownership
--      row until creator-owns-on-create shipped in this slice) is mapped to the bootstrap, so the
--      demoted admin keeps managing exactly what it reached before, and no venue is orphaned.
--
-- JDBC-only stack (invariant #1); status stays TEXT + CHECK, not a native ENUM.

-- 1. Registration/approval states.
ALTER TABLE operator DROP CONSTRAINT operator_status_check;
ALTER TABLE operator ADD CONSTRAINT operator_status_check
    CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'));

-- 2. Contact email (nullable — the bootstrap admin has none; self-registered operators supply one).
ALTER TABLE operator ADD COLUMN contact_email TEXT;

-- 3. Admin authority — demote the owns-all bootstrap to the platform admin.
ALTER TABLE operator ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE operator SET is_admin = TRUE WHERE username = 'operator';

-- 4a. Backfill: make the bootstrap's previously-implicit ownership explicit BEFORE dropping owns_all,
--     so retiring the crutch orphans nothing. NOT EXISTS-guarded (a venue already owned is left alone).
INSERT INTO operator_venue (venue_id, operator_id)
SELECT v.id, o.id
FROM   venue v
CROSS  JOIN operator o
WHERE  o.username = 'operator'
  AND  NOT EXISTS (SELECT 1 FROM operator_venue ov WHERE ov.venue_id = v.id);

-- 4b. Retire the owns-all crutch. Ownership is now strictly the explicit operator_venue mapping.
ALTER TABLE operator DROP COLUMN owns_all_venues;
