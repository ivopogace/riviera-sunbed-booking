# Runbook: GDPR right-to-erasure (data subject)

How the platform honours a tourist's right to erasure (#101 Slice 1). The design rationale — why we
pseudonymize in place rather than delete — is **ADR-0010**; this runbook is the operational procedure.

## What erasure does

Erasure **scrubs PII in place (tombstone)** — it never deletes rows a retained financial record
references (`booking.customer_id` / `account_id` are `ON DELETE RESTRICT`).

| Data | On erasure | Why |
|---|---|---|
| `customer_account.email` / `password_hash` | tombstoned (`erased+<id>@erased.invalid` / `NULL`), `erased_at` set | account identity PII |
| `customer.email` / `full_name` / `phone` | tombstoned (`erased+<id>@erased.invalid` / `ERASED` / `ERASED`), `erased_at` set | guest-contact PII |
| `customer_sso_identity` rows | **deleted** | transient credential (provider subject + email) |
| `customer_account_token` rows | **deleted** | transient bearer digests |
| server-side sessions for the subject | **revoked** (`CustomerSessionRevoker`) | the subject is signed out everywhere |
| `booking`, `payment`, `payout_ledger_entry` | **untouched** | statutory-retention exception (tax/accounting; GDPR Art 17(3)(b)); the ledger holds no PII, so auditability (invariant #9) is preserved |

Erasure is **idempotent** — every scrub is guarded on `erased_at IS NULL`. Re-running it is safe.

## Running an erasure

### Self-service (a signed-in tourist)

The account page (`/account/password`, "Your account") has a **Danger zone → Erase my account & data**
button behind a two-step confirm. On confirm the SPA calls `POST /api/me/erasure` (CUSTOMER, session-
scoped), the account + any guest contact sharing its email are tombstoned, and the tourist is signed
out. Nothing to do operationally — this is the primary, self-served path.

### Admin-actioned (a data-subject request by email)

For a guest with no account, an account holder who cannot self-serve, or a request arriving by email,
a **platform admin** (the `is_admin` operator, unlocked by `RIVIERA_OPERATOR_PASSWORD`) calls:

```
POST /api/admin/erasure
Content-Type: application/json
{ "email": "<the data subject's email, lower-cased or not — normalized server-side>" }
```

- ADMIN role only (`403` for operator/customer/anonymous); an authenticated ADMIN **session cookie**
  + the `X-XSRF-TOKEN` header are required (CSRF-protected, like every other `/api/admin` POST).
- Response is always `204` on success / already-erased / nothing-to-match (non-enumerating — it never
  reveals whether the email existed); a blank email is `400 INVALID_REQUEST`.
- It erases **any** account **and** guest row sharing that email. A guest row whose email diverges
  from the account email is a separate subject — submit that email too.

> There is no admin console screen for erasure yet (API-only in Slice 1, like the admin endpoints that
> predated their console tabs). Drive it with an authenticated `curl`/HTTP client, or add a console
> surface in a follow-up.

## Accountability / audit

Each erasure emits a structured log line (the #100 structured logger) carrying **only** the outcome +
technical ids + actor — never an email, name, phone, or booking code. Look for
`customer account erasure outcome=…` (self-service) / `customer erasure by admin outcome=…` in the
aggregated logs to evidence that a request was actioned and when. The `erased_at` column on the
tombstoned rows is the durable in-DB marker.

## Backups and restore (re-erase-on-restore)

Erasure cannot reach copies already written to backups/PITR. This is acceptable under GDPR provided
the backup retention window is bounded and erasures are **re-applied on restore**:

1. **Bounded window.** Backups older than the agreed retention window `<counsel-TBD — set with legal;
   the automated retention job, Slice 2, will formalize the app-side window>` age out on schedule, so a
   pre-erasure copy is not kept indefinitely.
2. **On any restore from a backup that pre-dates an erasure**, before returning the restored database
   to service, re-apply every erasure that has happened since the backup was taken. The set to replay
   is auditable from the erasure log lines (above) — for each, re-run the same erasure
   (`POST /api/admin/erasure` by email, or `POST /api/me/erasure` for the account) against the
   restored instance. Because erasure is idempotent, replaying an already-tombstoned subject is a
   no-op, so over-replaying is safe.
3. Record the restore + the re-erasure replay in the incident/restore log.

## Verifying an erasure

Against the target database (read-only check):

```sql
SELECT id, email, erased_at FROM customer_account WHERE id = :id;   -- email = erased+<id>@…, erased_at set
SELECT id, email, full_name, phone, erased_at FROM customer WHERE id = :id;
SELECT count(*) FROM customer_sso_identity   WHERE account_id = :id; -- 0
SELECT count(*) FROM customer_account_token  WHERE account_id = :id; -- 0
-- retained, unchanged:
SELECT status FROM booking WHERE account_id = :id;                   -- rows still present
```
