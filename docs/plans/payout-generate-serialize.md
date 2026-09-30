# Payout batch generation serializes per period Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** two concurrent `generate` runs for one period leave each `DRAFT` batch at the ledger's net as of the
later run, never an older total.

**Architecture:** `generate` takes a transaction-scoped advisory lock keyed by the period, in a statement of its own
before it reads the batches or the ledger. A second run then reads the ledger after the first commits, so the upserts
land in the order of the reads. There is no period row to lock: the first run for a period has no batch rows yet.

**Source of intent:** #1309 (sweep for #1298). Owner decision: serialize only; `mark(REPORTED)` carrying the reviewed
total is a follow-up issue.

**Branch:** `bugfix/payout-generate-serialize`

## Acceptance criteria

- [x] **AC-1:** Given a `generate` paused after its ledger read of venue V at 1000, when a reversal of 200 for V
  commits and a second `generate` runs, then the `DRAFT` batch ends at 800. *Seam:* `PayoutReport.generate` racing
  itself · *Pinned by:* `PayoutGenerateRaceIT.twoGeneratesAroundALedgerCommitLeaveTheLedgersNet` (red on `main`: 1000).
- [x] **AC-2:** the generation, lifecycle and batch-race suites stay green.

## Non-goals

- `mark(REPORTED)` checking the total the admin reviewed (follow-up issue).

## Risks

- **R-1 (invariant #9):** the ledger is untouched; only the order of batch refreshes changes. A frozen batch stays
  frozen (`upsertDraft`'s `status = 'DRAFT'` guard).
- **R-2 (a new cycle):** the advisory lock is taken first and only by `generate`; `mark` and the ledger writers never
  take it, so it waits on nothing they hold.
- **R-3 (hash collision):** two periods hashing alike only serialize with each other; harmless.

## Payment & payout

- **Ledger effect:** none. **Idempotency:** `generate` stays an idempotent refresh (invariant #9).

## Phases

- **Phase 0 — red:** AC-1.
- **Phase 1 — lock:** `PayoutBatches#lockPeriod`, taken first in `generate`.
- **Phase 2 — docs:** `RESPONSIBILITIES.md` §payout, Javadoc.

## Execution status

**Stage pointer:** review

**Next action:** review gate, record, plan removal, CI and Sonar, merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — red | ✅ | 32d015fa |
| 1 — lock | ✅ | 9d817066 |
| 2 — docs | ✅ | 9d817066 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
