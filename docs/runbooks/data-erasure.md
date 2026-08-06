# Runbook: GDPR right-to-erasure (data subject) + retention sweep

How the platform honours a tourist's right to erasure (#101 Slice 1) and how it enforces **storage
limitation** by automatically expiring guest contacts whose retention basis has run out (#101 Slice 2).
The design rationale — why we pseudonymize in place rather than delete — is **ADR-0010**; this runbook is
the operational procedure. Both paths write the *same* tombstone; they differ only in what triggers them:
a data subject's request, versus the passage of time.

## What erasure does

Erasure **scrubs PII in place (tombstone)** — it never deletes rows a retained financial record
references (`booking.customer_id` / `account_id` are `ON DELETE RESTRICT`).

| Data | On erasure | Why |
|---|---|---|
| `customer_account.email` / `password_hash` | tombstoned (`erased+<id>@erased.invalid` / `NULL`), `erased_at` set | account identity PII |
| `customer.email` / `full_name` / `phone` | tombstoned (`erased+<id>@erased.invalid` / `ERASED` / `ERASED`), `erased_at` set | guest-contact PII |
| `customer_sso_identity` rows | **deleted** | transient credential (provider subject + email) |
| `customer_account_token` rows | **deleted** | transient bearer digests |
| server-side sessions for the subject | **revoked** (`PrincipalSessionRevoker`), before *and* after the scrub | the subject is signed out everywhere; revoking first means a failed revoke leaves the data intact and the retry works, revoking again afterwards stops a sign-in landing in between from outliving the erasure (#357) |
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

> **Use the console: the Privacy tab at `/admin/privacy`** (A3, epic #348, PR #526) — the endpoint was
> API-only from #101 Slice 1 until then. It is address → confirm → done, and the irreversible step
> collects optional `X-Audit-Reason` grounds, which `admin_audit_record` keeps (#507). Because the
> `204` above is non-enumerating, the done panel deliberately reports the same thing for a real scrub
> and an unknown address — a confirmation there is **not** evidence the subject existed. An
> authenticated `curl`/HTTP client still works and is the right tool for a scripted replay (see
> *Backups and restore*, below).

## Accountability / audit

Each erasure emits a structured log line (the #100 structured logger) carrying **only** the outcome +
technical ids + actor — never an email, name, phone, or booking code. Look for
`customer account erasure outcome=…` (self-service) / `customer erasure by admin outcome=…` in the
aggregated logs to evidence that a request was actioned and when. The `erased_at` column on the
tombstoned rows is the durable in-DB marker.

## Backups and restore (re-erase-on-restore)

Erasure cannot reach copies already written to backups/PITR. This is acceptable under GDPR provided
the backup retention window is bounded and erasures are **re-applied on restore**:

1. **Bounded window.** Backups older than the agreed retention window age out on schedule, so a
   pre-erasure copy is not kept indefinitely. The **app-side** window is now formalized as
   `customer.retention.window` (see *Automated retention sweep*, below) — configurable and **set per
   counsel**; the sweep ships disabled until it is set. The **backup** retention window is a hosting
   setting, still to be agreed with counsel as part of the Hetzner backup/PITR cutover (ADR-0004).
2. **On any restore from a backup that pre-dates an erasure**, before returning the restored database
   to service, re-apply every erasure that has happened since the backup was taken. The set to replay
   is auditable from the erasure log lines (above) — for each, re-run the same erasure
   (`POST /api/admin/erasure` by email, or `POST /api/me/erasure` for the account) against the
   restored instance. Because erasure is idempotent, replaying an already-tombstoned subject is a
   no-op, so over-replaying is safe.
3. Record the restore + the re-erasure replay in the incident/restore log.

## Automated retention sweep (#101 Slice 2)

Erasure above is **reactive** — someone asks. The retention sweep is **proactive**: it tombstones guest
contacts the platform no longer has a lawful basis to hold, satisfying GDPR storage limitation
(Art 5(1)(e)) without anyone filing a request.

### What it scrubs — and what it never touches

It scrubs **guest `customer` rows only** (`email` / `full_name` / `phone` → the same tombstone as an
erasure, `erased_at` set). It does **not** touch `customer_account` rows: scrubbing an account is de-facto
account deletion, which needs advance notice by email, and the mailer is still mocked (→ **#255**).
`booking`, `payment` and `payout_ledger_entry` are **never** touched — the statutory-retention exception,
exactly as for a requested erasure (invariant #9).

### The three gates

A contact is scrubbed only when **all three** agree it has no live basis. Any one of them retains it:

| # | Gate | Where it is evaluated |
|---|---|---|
| 1 | the `customer` row itself is older than `customer.retention.window` (`updated_at` before the cutoff) | candidate SQL, `JdbcAccountErasure` |
| 2 | no **live** `customer_account` (`erased_at IS NULL`) claims that email — a signed-up customer's contact is never swept | candidate SQL, same query |
| 3 | the guest has **no booking dated on or after the cutoff**, any status (a cancelled or no-show booking still produced a financial record, so it still counts) | `customer.spi.GuestBookingHistory`, answered by the `booking` module |

The boundary is **inclusive-retain**: a booking exactly *on* the cutoff date keeps the contact. A guest
with no bookings at all is swept once its own row ages out — that is the abandoned-checkout cleanup case.

### Knobs

All under `customer.retention.*` in `application.properties`:

| Property | Default | Accepted range | Meaning |
|---|---|---|---|
| `enabled` | **`false`** | — | While false **no scheduler bean exists**, so nothing can sweep |
| `window` | `P10Y` | **any positive period** | ISO-8601 **period** (years/months/days — *not* a duration). Deliberately inert: longer than any plausible statutory period |
| `batch-size` | `500` | **`1`–`10000`** | Most contacts one run may scrub; the remainder waits for the next run |
| `sweep-interval` | `PT6H` | — | `fixedDelay` between runs — slack by design; a retention window is measured in years |
| `initial-delay` | `PT5M` | — | Keeps the sweep off the startup hot path |

> **The two ranges are enforced at boot** (#414) — a value outside them fails the context rather than
> degrading quietly, so step 2 below cannot deploy a window the app will not honour. `P0D` is the one
> to know about: it puts the cutoff at **today**, so the first sweep scrubs every guest contact with no
> booking on or after today, irreversibly. A **mixed-sign** period is refused too (`P1M-40D` reads
> positive by total months yet moves the cutoff *forward*), so express the window plainly — `P2Y`,
> `P10Y`. There is deliberately **no upper** bound on `window`: a longer window scrubs *less*, which is
> the safe direction. `batch-size=0` is the mirror — it reaches `LIMIT 0`, so the sweep finds no
> candidates and returns **without logging anything**, scrubbing nothing for as long as it stays set.

### Enabling it (the procedure)

1. **Get the window from counsel.** This is a legal determination, not an engineering one — how long a
   guest contact may be held after the last booking that justifies it. The shipped `P10Y` is a
   placeholder, not advice.
2. Set `customer.retention.window` to that value and deploy. Nothing sweeps yet.
3. **Dry-run the blast radius** against the target database before enabling, using the same three gates
   (substitute the chosen window for `10 years`):

   ```sql
   SELECT count(*) FROM customer c
   WHERE c.erased_at IS NULL
     AND c.updated_at < NOW() - INTERVAL '10 years'
     AND NOT EXISTS (SELECT 1 FROM customer_account a WHERE a.email = c.email AND a.erased_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM booking b
                     WHERE b.customer_id = c.id
                       AND b.booking_date >= (CURRENT_DATE - INTERVAL '10 years'));
   ```

   If that count surprises you, **stop** — the window is wrong. Erasure is irreversible.
4. Set `customer.retention.enabled=true` and deploy. The first run happens `initial-delay` after startup.
5. Confirm from the logs: `retention sweep scrubbed N expired guest contact(s) with cutoff YYYY-MM-DD`.
   The line carries counts and the cutoff only — never an email, name, phone, or booking code.

**To stop it**, set `enabled=false` and redeploy; already-tombstoned rows stay tombstoned (there is no
un-erase — see ADR-0010).

### Safety properties

- **Idempotent.** Every scrub is `UPDATE … WHERE id = :id AND erased_at IS NULL`, and tombstoned rows are
  not candidates, so re-running scrubs nothing and never re-stamps `erased_at`.
- **No distributed lock needed.** `fixedDelay` means a run never overlaps itself on one instance, and the
  guarded `UPDATE` means at most one runner can tombstone a given row — so an overlap with a Slice-1
  erasure of the same row is safe too, whichever lands first.
- **Bounded.** `batch-size` caps every run, so a backlog can never produce an unbounded transaction.
- **A swept tourist is not broken.** `findOrCreate` is `INSERT … ON CONFLICT (email)`, so a scrubbed row's
  email no longer matches and a returning tourist simply gets a fresh guest row at checkout.

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
