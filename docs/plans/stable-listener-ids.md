# Event publication registry: stable listener ids, staleness and spine resubmission Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** Every registry-tracked listener is stored under an explicit, rename-proof id. Outstanding
rows keep matching across the deploy. A stuck or failed publication on the idempotent spine is
retried automatically, a bounded number of times.

**Architecture:** `@ApplicationModuleListener(id = …)` / `@TransactionalEventListener(id = …)` set the
id that `TransactionalApplicationListener.getListenerId()` returns and the registry stores. One
forward migration maps every old signature id to its new id. Staleness marks stuck
`PUBLISHED`/`PROCESSING`/`RESUBMITTED` rows `FAILED`. Each owning module (`booking`, `payout`,
`venue`) runs its own scheduled `FailedEventPublications.resubmit(ResubmissionOptions)`, filtered
to its own allowlisted spine ids. Each module scopes its own listeners, as the existing admin
levers do. Root placement would collide with ADR-0028's pending `monitoring` move.

**Source of intent:** GitHub issue #1340

**Branch:** `feature/1340-stable-listener-ids`

## Acceptance criteria

- [ ] **AC-1:** Given every method annotated (directly or meta) with `@TransactionalEventListener`
  under `ai.riviera.platform`, when the listeners are scanned, then each declares a non-blank
  explicit id, the ids are unique, and the set of `(id, event FQCN)` pairs equals the checked-in
  snapshot. *Seam:* the compiled listener annotations · *Pinned by:*
  `ListenerIdSnapshotTest.everyRegistryListenerHasAPinnedExplicitId`
- [ ] **AC-2:** Given a running context, when `BookingCancelled` is published and
  `BookingRefundListener` is registered, then the registry row's `listener_id` is the explicit id
  `booking.refund-on-booking-cancelled`. *Seam:* `event_publication.listener_id` · *Pinned by:*
  `RefundBulkheadIT.keepsTheListenerIdUnchanged` (updated)
- [ ] **AC-3:** Given outstanding and archived rows carrying a pre-V74 signature id, when V74
  runs, then each carries its mapped explicit id. A row already on a new id passes unchanged.
  *Seam:* V74 against Postgres · *Pinned by:* `StableListenerIdMigrationIT`
- [ ] **AC-4:** Given a `FAILED` publication for an allowlisted spine listener with
  `completion_attempts` below the cap, when the module's scheduled retry ticks, then it is
  resubmitted. A `FAILED` refund or mail publication, or a spine one at the cap, is not.
  *Seam:* the retry component over `FailedEventPublications` · *Pinned by:*
  `SpineRetryTest` per module (filter + options) and `SpineRetryIT` (a real FAILED row re-driven)
- [ ] **AC-5:** `spring.modulith.events.jdbc.schema-initialization.enabled=false` and the staleness
  keys are committed. *Pinned by:* `EventRegistryConfigurationTest`
- [ ] **AC-6:** `production-hardening.md` lists `republish-outstanding-events-on-restart=true`
  among the scale-out preconditions, and the staleness monitor plus the new retry jobs under
  *What breaks at two instances*.

## Non-goals

- Auto-retrying the refund-bulkhead or mail listeners (owner decision: refunds and mail stay on
  their admin levers; a duplicate mail has no dedupe and an outage would storm the gateway).
- Replacing the predicate-based admin levers. They also reach `PUBLISHED`/`RESUBMITTED` rows that
  the `FAILED`-only API misses, and staleness only reaches those after its threshold.
- Removing the `event_type` half of a move: moving an event class still needs a Flyway rewrite.
  The snapshot test turns that into a build failure.

## Risks

- **R-1: an id/old-signature mismatch in V74 dead-letters outstanding rows.** → The migration's
  old ids are the exact current signature ids. `StableListenerIdMigrationIT` seeds each old id and
  asserts the mapping. The snapshot file and V74's new ids are cross-checked by the IT.
- **R-2: a queued (not shed) publication past `staleness.published` is marked FAILED and re-run
  while the original still runs.** → Thresholds are hours, not minutes. Only idempotent spine
  listeners auto-retry: the guarded confirm/cancel transitions (#8), the ledger's
  `ON CONFLICT DO NOTHING` (#9) and the full-re-read rating. A double run is a no-op.
- **R-3: a poison event retried forever.** → The filter stops at `completion_attempts` ≥ the cap.
  The row stays FAILED, visible on `riviera.outbox.pending`, and the restart republish still
  covers it.
- **R-4: interaction with the abandoned-payment sweep.** → A late re-driven `PaymentConfirmed`
  meets the same guarded `AWAITING_PAYMENT` transition the restart republish meets today. The
  retry only shortens the window, and the sweep's `release` and the cancel listener share one
  guarded transition (no double release, #2).
- **R-5: scheduler starvation.** → The three new jobs plus the staleness monitor's registrar task
  raise `spring.task.scheduling.pool.size`. `ScheduledWorkArchitectureTest` lists the new jobs.
- **Flyway:** V74 is free on `main`, and no open PR claims a migration (checked 2026-10-01).

## Open questions

### Resolved

- Auto-retry scope → idempotent spine only (owner, 2026-10-01).
- Placement → per owning module, each in `adapter/in`, sharing a small option-building helper in
  `shared` beside `ResubmissionThrottle`.

## Modulith

No new port, event or grant. Each module's retry reads only its own listener ids. The
`FailedEventPublications` bean is framework infrastructure, as `IncompleteEventPublications` is
for the levers. `RegistryMailOutbox` scopes by the new id prefix `notification.`;
`RegistryRefundOutbox`'s allowlist moves to the explicit ids.

## Phases

- **Phase 0 — snapshot red:** `ListenerIdSnapshotTest` plus the snapshot file. Red until the ids
  exist.
- **Phase 1 — explicit ids + V74:** annotate all listeners. Update the outboxes' scopes, the
  fixtures and the "never rename" Javadocs. Add V74 and `StableListenerIdMigrationIT`.
- **Phase 2 — config:** schema-init off, staleness keys, `EventRegistryConfigurationTest`.
- **Phase 3 — spine retry:** a `shared` helper and the per-module scheduled retries, with the
  pool size and `ScheduledWorkArchitectureTest` updated. `SpineRetryTest`, `SpineRetryIT`.
- **Phase 4 — docs:** production-hardening, `RESPONSIBILITIES.md`, the `riviera-modulith` events
  reference, the inline comments on V18/V31-era fixtures.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** write `ListenerIdSnapshotTest`

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — snapshot red | ⏳ | |
| 1 — ids + V74 | | |
| 2 — config | | |
| 3 — spine retry | | |
| 4 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
