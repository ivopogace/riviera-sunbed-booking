# ADR-0012: The email-suppression list stores a peppered hash, not the address — and survives erasure

- **Status:** Accepted
- **Date:** 2026-07-27
- **Relates to:** ADR-0010 (erasure is pseudonymize-in-place), ADR-0011 (transactional email),
  #387 (this decision's issue), #101 (privacy-policy/processor work), invariant #6 (UTC
  timestamps)

## Context

The `notification` module's `email_suppression` table is the do-not-mail record ("no send to a
suppressed address") that both delivery vehicles consult on every send, and its entries are
deliberately **never deleted**. Stored as cleartext addresses, it interacted badly with ADR-0010:
the right-to-erasure scrub pseudonymizes `customer` / `customer_account` and never touches this
table, so a suppressed tourist who exercised erasure would keep their cleartext address here
indefinitely. The bounce/complaint feed will write real tourists' addresses the moment it lands,
so the posture had to be decided first.

The deciding constraint: the operations the system performs against this table are an equality
lookup on the normalized address (`isSuppressed`), the upsert that writes it, and an admin
reinstatement that locks the row by the same key. Nothing reads the raw address back out.

## Decision

**Store a peppered HMAC-SHA-256 of the normalized address (`email_key`) instead of cleartext,
plus the cleartext `domain` part; entries still survive erasure, deliberately.**

- The write path normalizes exactly as `customer`'s canonical form (`customer.vocabulary.Emails`),
  then keys the row on `HMAC-SHA-256(pepper, normalized-address)` (lower-case hex).
  `isSuppressed` applies the same normalize-then-hash before lookup. Both live in the one
  `adapter/out` (`JdbcEmailSuppressions`), so the bounce feed inherits them.
- The **pepper** is an env-managed, long-lived secret (fail-at-boot in prod when unset) held
  outside the database — what makes a leaked table dump inert, where a plain unsalted digest of
  an enumerable identifier would be dictionary-reversible. Consequence accepted: **rotating the
  pepper orphans every existing row**, so the pepper is treated like a KMS root — no rotation
  machinery in v1.
- A cleartext **`domain`** column (lower-cased) is kept for provider-level deliverability triage
  ("are we blocked at Yahoo?"). A bare domain does not identify a person.
- `reason` and the two UTC timestamps are unchanged; the **never-deleted contract stays**, and the
  entry **survives right-to-erasure — on purpose**. Legal basis: Art. 6(1)(f) legitimate interest
  (sender-reputation protection, and honoring the data subject's own expressed preference in the
  complaint case) — the German DSK's *Werbesperrliste* position: a minimal do-not-contact record
  must outlive the erasure, because deleting it would defeat the objection itself (an erased
  tourist who rebooks with the same address must stay suppressed). Storing it hashed is the
  data-minimization measure (Art. 5(1)(c)) the same guidance points to.
- **Never deleted is not never lifted.** A platform admin can *reinstate* an address
  (`POST /api/admin/email-suppressions/reinstate`, ADMIN-gated), which sets `reinstated_at` on
  the row rather than removing it; `isSuppressed` is `email_key = ? AND reinstated_at IS NULL`.
  The row, its `first_suppressed_at` and its `reason` survive, so a repeated reinstate→re-bounce
  cycle stays visible; a later bounce re-suppresses through the ordinary upsert, which clears the
  flag. The remedy for an address that hard-bounced for a transient reason (a full mailbox, a
  domain that came back). **A hard `DELETE` on this table remains a defect.** Reinstatement is an
  admin judgment call, never automatic and never an erasure side-effect; there is deliberately no
  self-service un-suppress — a complainer lifting their own suppression through a public endpoint
  would be both an abuse vector and an enumeration oracle.
- **The hash is still personal data.** A peppered HMAC is pseudonymization, not anonymization —
  the controller holds the pepper and can re-compute the key for any known address (Recital 26
  "singling out"). The posture claimed is *minimization under a documented legitimate interest*,
  never "no PII, no obligations". The privacy-policy / processor-register wording this requires is
  owed by the #101 work.
- No coupling to ADR-0010's scrub: erasure never touches this table. `customer` and
  `notification` stay strangers.

## Consequences

- Ops can no longer eyeball or grep the list by raw address. Checking a *specific* address still
  works — normalize and hash it (`docs/runbooks/suppression-list-ops.md`); listing "who is
  suppressed" as addresses is gone by design. Domain-level triage survives via `domain`.
- Every caller — the `MANUAL` suppression path, the reinstate endpoint, the bounce-feed webhook —
  takes raw addresses and hashes at the chokepoint; writing pre-hashed values from anywhere else
  is a defect. Ops never needs the pepper to *act*, only to investigate.
- The reinstate endpoint answers with the row's technical facts (`reason`, `first_suppressed_at`,
  `last_event_at`, and on a repeat call the original `reinstatedAt`), so the check-then-lift
  workflow is one call and no separate lookup endpoint exists.
- A future implementer must **not** add a cleartext address column back, log raw addresses on the
  suppression path, or scrub this table from the erasure flow — any of these re-opens this ADR
  (the last one would *harm* the data subject: see the rebooking scenario above).
- The reverse decision after the feed ships real data would be a one-way door (cleartext is
  unrecoverable from hashes — which is the point).

## Alternatives considered

- **Erasure hook** (scrub the matching suppression row when a customer erases): rejected. It needs
  a cross-module seam ADR-0010 deliberately avoided, and it is *worse for the data subject* — a
  complainer who erases and later rebooks with the same address would be mailed again.
- **Documented cleartext retention** (Art. 6(1)(f) reasoning over the cleartext shape): defensible,
  and what most of the industry silently runs — rejected because it takes on a permanent
  cleartext PII store plus its audit burden when a two-hour change removes the problem.
- **Plain SHA-256 without a pepper:** rejected — emails are enumerable, so an unpeppered digest is
  reversible by dictionary; minimization theater.
- **A retention cap on hashed entries** (drop after N quiet years): declined for v1 — for hard
  bounces it is counterproductive (the address is still dead), and the hashed form makes the
  retained data minimal already. Revisit only if counsel asks.

## Amendment log

- 2026-07-28, #391 — admin reinstatement as a flag on the row; "never deleted" distinguished from
  "never lifted".
- #815 — erasure now also reaches `review`'s rows (ADR-0010's amendment); this table is still
  untouched.
