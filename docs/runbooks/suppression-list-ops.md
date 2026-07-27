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
- **Removing:** rows are never deleted by the application (durable do-not-mail record,
  ADR-0012 — the entry deliberately survives right-to-erasure). A manual `DELETE` is an
  explicit, logged ops decision, e.g. after a provider confirms a hard bounce was transient.
