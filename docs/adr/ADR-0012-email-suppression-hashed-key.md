# ADR-0012: The email-suppression list stores a peppered hash, not the address — and survives erasure

- **Status:** Accepted (decided by #387; realized by #388)
- **Date:** 2026-07-27
- **Relates to:** ADR-0010 (erasure is pseudonymize-in-place), ADR-0011 (transactional email /
  Scaleway TEM), #382/#385 (the V32 suppression-list slice), #370 (provider setup + the future
  bounce/complaint feed), #101 (privacy-policy/processor work), invariant #6 (UTC timestamps)

## Context

#382 shipped the `notification` module's `email_suppression` table (V32): cleartext normalized
addresses, deliberately **never deleted** — the do-not-mail check ("no send to a suppressed
address") that both delivery vehicles consult on every send. The post-merge review flagged the
interplay nobody had examined: ADR-0010's right-to-erasure scrub pseudonymizes `customer` /
`customer_account` and never touches this table, so **a suppressed tourist who exercises erasure
would keep their cleartext address here indefinitely**. Today that is theoretical (only tests
write the table), but the #370 bounce/complaint feed will write real tourists' addresses the
moment it lands — so the posture had to be decided first (#387).

The deciding constraint: the **only** operation the system ever performs against this table is an
equality lookup on the normalized address (`isSuppressed`), plus the upsert that writes it.
Nothing reads the raw address back out.

## Decision

**Store a peppered HMAC-SHA-256 of the normalized address (`email_key`) instead of cleartext,
plus the cleartext `domain` part; entries still survive erasure, deliberately.**

- The write path normalizes exactly as today (trim, lower-case — the `customer` module's
  canonical form), then keys the row on `HMAC-SHA-256(pepper, normalized-address)` (lower-case
  hex). `isSuppressed` applies the same normalize-then-hash before lookup. Both live in the one
  `adapter/out` (`JdbcEmailSuppressions`), so the #370 feed inherits them for free.
- The **pepper** is an env-managed, long-lived secret (fail-at-boot in prod when unset, the
  `SmtpMailer` posture) held outside the database — that is what makes a leaked table dump
  inert, where a plain unsalted digest of an enumerable identifier would be
  dictionary-reversible. Consequence accepted: **rotating the pepper orphans every existing
  row** (their keys become unmatchable), so the pepper is treated like a KMS root — no rotation
  machinery in v1.
- A cleartext **`domain`** column (the part after the `@`, lower-cased) is kept for
  provider-level deliverability triage ("are we blocked at Yahoo?"). A bare domain does not
  identify a person; this preserves most of the operational value cleartext advocates would miss.
- `reason` and the two UTC timestamps are unchanged; the **never-deleted contract stays**, and
  in particular the entry **survives right-to-erasure — on purpose**. Legal basis: Art. 6(1)(f)
  legitimate interest (sender-reputation protection, and honoring the data subject's own
  expressed preference in the complaint case) — the German DSK's *Werbesperrliste* position:
  a minimal do-not-contact record must outlive the erasure, because deleting it would defeat
  the objection itself (an erased tourist who rebooks with the same address must stay
  suppressed). Storing that record hashed is the data-minimization measure (Art. 5(1)(c)) the
  same guidance points to.
- **The hash is still personal data.** A peppered HMAC is pseudonymization, not anonymization —
  the controller holds the pepper and can re-compute the key for any known address (Recital 26
  "singling out"). The posture claimed is *minimization under a documented legitimate
  interest*, never "no PII, no obligations". The privacy-policy / processor-register wording
  this requires (retention of pseudonymized suppression data, basis Art. 6(1)(f)) is owed by
  the #101 work.
- No coupling to ADR-0010's scrub is added: erasure continues to touch only `customer`-owned
  rows. `customer` and `notification` stay strangers.

## Consequences

- Ops can no longer eyeball or grep the list by raw address. Checking a *specific* address still
  works — normalize and hash it (a small ops runbook note, owed by #388); listing "who is
  suppressed" as addresses is gone by design. Domain-level triage survives via `domain`.
- The `MANUAL` suppression path takes raw addresses as input like every caller and hashes at the
  chokepoint — no caller ever handles keys directly.
- The #370 feed webhook must pass raw provider addresses through the same adapter; writing
  pre-hashed values from anywhere else is a defect.
- A future implementer must **not** add a cleartext address column back, log raw addresses on
  the suppression path, or scrub this table from the erasure flow — any of these re-opens this
  ADR (the last one would *harm* the data subject: see the rebooking scenario above).
- Migration cost today is zero (the table is empty everywhere); the reverse decision after #370
  ships real data would have been a one-way door (cleartext is unrecoverable from hashes — which
  is the point).

## Alternatives considered

- **Erasure hook** (scrub the matching suppression row when a customer erases): rejected. It
  needs a cross-module seam ADR-0010 deliberately avoided, and it is *worse for the data
  subject* — a complainer who erases and later rebooks with the same address would be mailed
  again, violating their expressed preference and the sender's reputation at once.
- **Documented cleartext retention** (Art. 6(1)(f) reasoning over the V32 shape unchanged):
  defensible, and what most of the industry silently runs — rejected because it takes on a
  permanent cleartext PII store plus its audit burden when a two-hour change removes the
  problem, and the only functional reader is an equality check a hash serves identically.
- **Plain SHA-256 without a pepper:** rejected — emails are enumerable, so an unpeppered digest
  of them is reversible by dictionary; it would be minimization theater.
- **A retention cap on hashed entries** (drop after N quiet years): declined for v1 — for hard
  bounces it is counterproductive (the address is still dead), and the hashed form makes the
  retained data minimal already. Revisit only if counsel asks.
