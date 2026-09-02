# ADR-0010: Right-to-erasure is pseudonymize-in-place under statutory retention

- **Status:** Accepted (realized by #101 Slice 1); amended 2026-09-02 by #815 (the scrub reaches
  `review` — see *Amendment*)
- **Date:** 2026-07-24
- **Relates to:** invariant #9 (payout-ledger auditability), invariant #1 (JDBC-only), D-6
  (account identity is separate from the guest-contact row), #100 (structured audit logging)

## Context

GDPR Art 17 gives an EU data subject the right to erasure; an Albanian sh.p.k. processing EU
tourists' data owes it (Art 3(2) targeting + Albania's Law 9887). But Art 17(3)(b) carves out data
a controller must keep to meet a **legal obligation** — here, booking / payment / payout records are
accounting-and-tax records with a statutory retention period. So "erase everything" and "keep the
financial record" both bind at once, over the *same* person's data.

The schema already encodes the tension structurally. `booking.customer_id` (V5) and
`booking.account_id` (V26) are both **`ON DELETE RESTRICT`**, and the payout ledger's cross-module
FKs (V9) are `NO ACTION` with a deliberate "an audit row must not vanish" comment. A customer /
account row that has bookings therefore **cannot be hard-deleted** — the database refuses it. That
RESTRICT is not an obstacle to work around; it *is* the retention obligation expressed in DDL.

Two erasure shapes were possible:

1. **Delete the person's rows, null/cascade the references.** Requires either dropping the FK to
   `ON DELETE SET NULL` (severing a booking from its owner — losing audit linkage) or deleting the
   booking too (destroying the retained financial record). Both break invariant #9 or the tax
   obligation.
2. **Scrub-in-place (tombstone).** Keep every row; overwrite only the PII columns with non-PII
   placeholders and delete the transient credential children. The financial rows stay intact and
   FK-valid, now pointing at an anonymized contact.

## Decision

**Erasure pseudonymizes in place; it never hard-deletes a row a retained record references.**

- The `customer` (guest contact) and `customer_account` rows are **tombstoned**: `email` becomes a
  deterministic, unique, non-routable placeholder `erased+<id>@erased.invalid` (reserved `.invalid`
  TLD, RFC 2606; per-row `id` keeps it unique against the `email` UNIQUE constraint),
  `full_name`/`phone` become `'ERASED'`, `password_hash` becomes `NULL`, and a new nullable
  `erased_at TIMESTAMPTZ` marker (Flyway **V30**) is set.
- The transient credential **children are deleted**: `customer_sso_identity` (carries a provider
  subject + email) and `customer_account_token` (bearer digests). These are not audit records.
- `booking`, `payment`, and `payout_ledger_entry` are **never touched**. The payout ledger holds no
  PII by design (venue-ids, booking-ids, money — RESPONSIBILITIES `payout` Not-My-Job), so severing
  the personal link cannot affect its auditability or exactly-once accrual (invariant #9 preserved).
- *(Superseded in part by the amendment below: the review scrub lives in `review`'s own adapter.)*
  All scrub SQL lives in **one** `customer`-module adapter (`JdbcAccountErasure` behind the internal
  `AccountErasureStore` port) so "what erasure touches" has a single home. Every scrub is guarded on
  `erased_at IS NULL` → **idempotent**. The account and guest identities are matched independently
  (by id / by email), because D-6 forbids an FK between them.
- Two authenticated edge surfaces drive the published `customer.api.AccountErasure` port:
  self-service `POST /api/me/erasure` (CUSTOMER, session-scoped) and admin `POST /api/admin/erasure`
  (ADMIN, by email). The edge revokes the subject's sessions (`PrincipalSessionRevoker`, generalized
  from `CustomerSessionRevoker` in #128 to serve both principal types) and records
  the event via the #100 structured logger with technical ids only — never PII or a booking code.
- **Backups** hold pre-erasure copies erasure cannot reach; that is handled operationally, not in
  code — a bounded backup-retention window plus re-applying `erased_at`-flagged erasures on any
  restore (documented in `docs/runbooks/data-erasure.md`).

## Consequences

- A tombstoned account cannot log in (no password; its email is unknowable) and lists no PII, while
  its bookings remain auditable and its payout ledger unchanged — the compliance and accounting
  obligations are met simultaneously.
- Guest-contact rows whose email diverges from the erased account's email are **not** reached by a
  single self-service call (D-6 leaves no link but the booking's `customer_id`); the admin-by-email
  path and the future retention job (Slice 2) cover them. Recorded as a scoped non-goal.
- A future implementer must **not** relax the `booking` FKs to `SET NULL`/`CASCADE`, add a hard
  `DELETE` of a customer/account row, or move PII into the ledger — any of which re-opens this ADR.
- No new prod secret, no schema-destructive DDL; V30 adds only the marker column.

## Alternatives considered

- **Hard delete + `ON DELETE SET NULL`.** Rejected: severs a booking from its owner, losing the
  audit linkage the RESTRICT FK exists to protect, and still needs a tombstone for the UNIQUE email.
- **Hard delete the bookings too.** Rejected: destroys statutory tax/accounting records (Art 17(3)(b)
  legal-obligation exception) and breaks invariant #9.
- **A dedicated `erasure_request` register table for accountability.** Deferred: `erased_at` + the
  #100 structured audit log satisfy accountability for v1 without a new table; add one only if
  counsel wants an in-DB register (recorded in the plan doc's Open questions).
- **Scrub across modules via cross-module ports (touch `booking` to null `account_id`).** Rejected:
  unnecessary — tombstoning the `customer`-owned rows keeps every FK valid, so erasure stays a
  single-module operation with no new cross-module coupling. *(Superseded in part by the amendment
  below once a second module came to hold PII.)*

## Amendment (2026-09-02, #815): the scrub reaches review PII through an inverted port

Reviews (#812) put personal data outside `customer`'s tables for the first time: a display name and
a free-text comment, attached to a **booking**, not a person. Erasure that stopped at `customer`
would leave the subject's chosen name and words standing on a venue page.

- **The tombstone extends, the shape does not change.** Every review of the subject's bookings has
  `display_name` and `comment` set to `NULL`; `stars`, `hidden_at` and the timestamps are untouched.
  The star identifies nobody and is the venue's earned score, so it keeps counting (the aggregate is
  unchanged by construction and no `ReviewsChanged` is published); without a comment the review
  leaves the public list under the star-only rule. Still pseudonymize-in-place, still no row deleted,
  still no FK relaxed.
- **The reach is synchronous and inverted, with no new grant.** `customer` declares
  `customer.spi.ReviewErasure`; `booking` — the only module that can both resolve a subject to
  bookings and reach `review`'s published surface — implements it in `adapter/out` and calls
  `review.api.ReviewTombstones`; `review` blanks its own rows. Both leaves stay leaves. It runs
  inside the erasure / sweep transaction, because the decision above ("all scrub SQL … one
  adapter") had a purpose this keeps: a half-erasure must never commit. An erasure *event* was
  rejected for that reason — it would move the review step outside the transaction.
- **The by-email scrubs now answer the ids they tombstoned** (`RETURNING id`), which is how the
  service knows whose reviews to reach. The account's reviews are reached on every *self-service*
  erasure of the account (by id), so a review written after an earlier erasure is scrubbed by the
  next one; a repeat *admin-by-email* erasure re-reaches neither an already-tombstoned account nor
  reviews on a tombstoned guest's bookings, since the placeholder email matches nothing — the same
  scoped non-goal as the diverging-email guest above.
- **Not a takedown, not a freeze.** The review is not hidden and its author (still holding the
  booking code) may write again inside the review window; that is fresh data of their own.
