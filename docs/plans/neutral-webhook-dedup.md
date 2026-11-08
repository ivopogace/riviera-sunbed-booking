# Provider-neutral webhook dedup Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the `payment` application layer names no provider, and webhook dedup is keyed by
`(provider, provider-scoped reference)`, so a production provider's notifications can never collide
with Stripe's, including a provider that sends no event id.

**Architecture:** `StripeWebhookEvents` becomes `WebhookEvents` (`firstSeen(provider, reference, type)`);
`stripe_webhook_event` becomes `payment_webhook_event` with a composite primary key, in one forward
migration (V79). The reference stays an opaque string: only an adapter knows how its provider's
notification is identified. The provider is a closed enum mirroring a DB `CHECK`, so a typo cannot
open a second dedup namespace.

**Source of intent:** issue #1688; ADR-0029 decisions 4 and 11.

**Branch:** `claude/1688-neutral-webhook-dedup-2b1b3a` (the worktree's designated branch).

## Acceptance criteria

- [x] **AC-1:** Given the compiled `payment.application` package, then no production type's name
  contains a provider's name. *Seam:* the package's classes · *Pinned by:*
  `ProviderNeutralApplicationLayerTest.applicationLayerNamesNoProvider`.
- [x] **AC-2:** Given a database at V78 holding recorded Stripe events, when V79 runs, then
  `stripe_webhook_event` is gone, every row reads as `STRIPE` under its old id, and a redelivery of a
  recorded event is still not first-seen. *Seam:* Flyway + `WebhookEvents` · *Pinned by:*
  `WebhookDedupMigrationIT.existingEventsBecomeStripesAndStayDeduplicated`.
- [x] **AC-3:** Given the migrated schema, then `(provider, reference)` is unique, a row must name its
  provider, and a provider outside the closed set is refused. *Seam:* the table · *Pinned by:*
  `PaymentMigrationIT.duplicateWebhookReferenceRejectedPerProvider`,
  `.aWebhookEventMustNameItsProvider`, `.anUnknownWebhookProviderRejected`.
- [x] **AC-4:** Given a signed Stripe event already processed, when it is redelivered, then it is a
  no-op. *Seam:* `POST /api/payments/stripe/webhook` · *Pinned by:*
  `StripeWebhookIT.duplicateDeliveryIsIdempotent` (existing, green).
- [x] **AC-5:** Given a reference recorded under one provider, when the same reference arrives under
  another, then it is first-seen, and a repeat under either is not. *Seam:* `WebhookEvents` · *Pinned
  by:* `JdbcWebhookEventsIT.theSameReferenceIsRecordedOncePerProvider`.
- [x] **AC-6:** Given a provider with no event id whose adapter derives a status-carrying reference,
  when a notification repeats, then it is deduplicated; when a later status arrives for the same
  order, then it is first-seen. *Seam:* `WebhookEvents` · *Pinned by:*
  `JdbcWebhookEventsIT.aDerivedReferenceDeduplicatesARepeat`,
  `.aLaterStatusForTheSameOrderGetsThrough`.
- [x] **AC-7:** Every `PaymentProvider` constant is admitted by the `CHECK`. *Seam:* `WebhookEvents` ·
  *Pinned by:* `JdbcWebhookEventsIT.everyProviderIsAdmittedByTheSchema`.
- [x] **AC-8:** `CLAUDE.md`'s `payment` row and `RESPONSIBILITIES.md` § `payment` name the new table;
  `ResponsibilitiesArchitectureTests` and the structural net are green.

## Non-goals

- No POK or Paysera adapter, callback route or reference-derivation code. The enum constants exist
  because the dedup key must admit them; their adapters arrive with ADR-0029's chosen provider.
- `StripeWebhookController` keeps its name and behaviour (an adapter may name its provider).
- `event_type` keeps its name: it is already neutral and is only ever written.

## Risks

- **R-1 (#8), a notification lost to the dedup:** the composite key could let a real status be dropped
  as a duplicate. The reference is the adapter's to derive and ADR-0029 decision 4 requires the
  verified state inside it; AC-6 pins that a later status passes.
- **R-2, a new row defaulting to Stripe:** a `DEFAULT 'STRIPE'` left behind would file a forgetful
  adapter's rows under Stripe. The default exists only to backfill; V79 drops it, AC-3 pins it.
- **R-3, deploy window:** an old instance still running during the rollover fails its insert into the
  renamed table. The controller is transactional, so it answers `5xx` and Stripe re-delivers; nothing
  is consumed unapplied. The app holds no live payments (ADR-0029 keeps Stripe sandbox-only).
- **R-4, Java and SQL token drift:** AC-7 fails when an enum constant has no `CHECK` token.
- **Flyway:** V79 is free on `main` (V78 is latest) and reserved for this slice; sibling #1690 takes
  V80 and merges after this one.

## Open questions

### Resolved

- ADR-0029 decision 4 includes the state read back in POK's reference; the issue text gives POK
  `(merchantId, sdkOrderId)`. The port's reference is opaque, so this slice is unaffected: the ADR
  governs the future adapter.
- Neutral names (`WebhookEvents`, `payment_webhook_event`, `reference`): the issue leaves naming open.
  The table takes the `payment_` prefix its siblings share.

## Modulith

No port crosses a module: `WebhookEvents` stays internal to `payment.application`, implemented by
`adapter/out/JdbcWebhookEvents`. `PaymentProvider` joins `payment.domain` beside `PaymentStatus`, the
CHECK-mirroring enum precedent. No grant changes.

## Payment & payout

No ledger or refund effect. Idempotency: `INSERT … ON CONFLICT (provider, reference) DO NOTHING`, the
same atomic primitive as before, on the new key. A redelivered Stripe event stays a no-op (#8); the
guarded state transitions remain the second layer.

## Phases

- **Phase 0, migration and neutral port:** V79, `WebhookEvents`, `JdbcWebhookEvents`, `PaymentProvider`
  · red `WebhookDedupMigrationIT`, `JdbcWebhookEventsIT`, `PaymentMigrationIT`'s new cases,
  `ProviderNeutralApplicationLayerTest`.
- **Phase 1, documents:** `CLAUDE.md`, `RESPONSIBILITIES.md`, `domain-model.md`,
  `ResponsibilitiesArchitectureTests` · red: the sole-writer scan.

## Execution status

**Stage pointer:** PR, then review

**Next action:** open the PR, CI green, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0, migration and neutral port | ✅ | this commit |
| 1, documents | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
