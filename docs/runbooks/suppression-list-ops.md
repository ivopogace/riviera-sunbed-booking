# Email-suppression list — ops runbook (hashed keys)

Since V33 (#388, [ADR-0012](../adr/ADR-0012-email-suppression-hashed-key.md)) the
`email_suppression` table stores **no cleartext address**: each row is keyed on
`email_key = 'v1:' || lower-hex HMAC-SHA-256(pepper, normalized address)` plus the cleartext
`domain` part. Listing "who is suppressed" as addresses is gone **by design**; the recipes
below cover what ops still needs.

## The pepper

- Supplied as `RIVIERA_SUPPRESSION_PEPPER` (→ `riviera.notification.suppression-pepper`).
  Under the `prod` profile boot **aborts** when it is unset or left at the committed dev
  default (`SuppressionPepperProdGuard`); dev/tests run on the committed default.
- It is a **long-lived secret — treat it like a KMS root key**. Rotating it orphans every
  stored row (their keys become unmatchable; ADR-0012 accepted consequence). There is no
  rotation machinery in v1; the `v1:` tag in the stored value is the hook a future
  dual-scheme migration would use.
- Never log it, never commit a real value.

## Check whether a specific address is suppressed

Normalize (trim, lower-case) the address, HMAC it with the pepper, prefix `v1:`. **Never put
the pepper on a command line** (argv is world-readable in the process table and lands in shell
history); read it from the environment instead — and let an unset variable fail loudly:

```bash
KEY="$(python3 - 'Foo@Bar.com' <<'PY'
import hashlib, hmac, os, sys
address = sys.argv[1].strip().lower()
pepper = os.environ["RIVIERA_SUPPRESSION_PEPPER"]  # KeyError = loud failure when unset
print("v1:" + hmac.new(pepper.encode(), address.encode(), hashlib.sha256).hexdigest())
PY
)"
psql "$DATABASE_URL" -c "SELECT reason, first_suppressed_at, last_event_at
                         FROM email_suppression WHERE email_key = '$KEY';"
```

The recipe normalizes for you (trim + lower-case, matching the adapter). Caveat for
internationalized addresses: the adapter lower-cases with Java's `Locale.ROOT`; Python's
`.lower()` matches it for all practical cases, but a shell `tr '[:upper:]' '[:lower:]'` is
ASCII-only — don't hand-normalize non-ASCII addresses.

A future `v2` key scheme must dual-look-up (v2 then v1) during its transition and collapse
duplicate rows per address keeping the older `first_suppressed_at` — obligations recorded in
the V33 header and the #388 addendum.

## Provider-level deliverability triage

The cleartext `domain` column answers "are we blocked at a provider?" without any PII:

```sql
SELECT domain, reason, count(*) AS entries, max(last_event_at) AS latest
FROM email_suppression
GROUP BY domain, reason
ORDER BY entries DESC;
```

## Manual suppression / un-suppression

- **Adding:** go through the application write path (the `MANUAL` reason) when a surface for
  it exists; a hand-written `INSERT` must produce the exact key format above — the
  `CHECK (email_key ~ '^v1:[0-9a-f]{64}$')` rejects cleartext, but a wrongly-computed hash
  would silently never match. Prefer computing the key with the recipe above.

- **Lifting a suppression — use the endpoint, not SQL** (#391). Signed in as a platform admin:

  ```bash
  curl -X POST "$BASE_URL/api/admin/email-suppressions/reinstate" \
       -H 'Content-Type: application/json' \
       -b "$ADMIN_COOKIES" -H "X-XSRF-TOKEN: $CSRF" \
       -d '{"email":"recovered@example.com"}'
  ```

  It takes the **raw address** (normalization + hashing happen at the chokepoint, so you never
  need the pepper to act) and answers with the row's technical facts, so a separate "is this
  suppressed?" lookup is unnecessary:

  | `outcome` | Meaning | Also returned |
  |---|---|---|
  | `REINSTATED` | It was actively suppressed; it is now mailable again | `reason`, `firstSuppressedAt`, `lastEventAt` |
  | `ALREADY_REINSTATED` | Someone already lifted it; nothing changed | the above + the **original** `reinstatedAt` |
  | `NOT_SUPPRESSED` | Never on the list — nothing was written | — |

  The action is idempotent and leaves an audit line carrying the outcome and reason only (never
  the address or its domain). A later hard bounce or complaint re-suppresses the address
  automatically through the ordinary write path.

- **Do not `DELETE`.** Rows are never deleted by the application, and a hand-run `DELETE` is now a
  **defect**, not an escape hatch — earlier revisions of this runbook prescribed one, which
  destroys the durable deliverability record ADR-0012 exists to keep (`first_suppressed_at`, the
  prior `reason`, and any evidence of a repeated reinstate→re-bounce loop). Reinstatement is the
  sanctioned way to make an address mailable again, and it keeps all of that. The entry still
  deliberately survives right-to-erasure; lifting it is an admin judgment call, never an automatic
  consequence of anything.
