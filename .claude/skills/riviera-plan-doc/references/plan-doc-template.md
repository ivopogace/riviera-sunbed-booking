# <Feature Title> Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** <one sentence; concrete, falsifiable>

**Architecture:** <2–3 sentences; the single most significant decision and why>

**Source of intent:** <spec path and/or GitHub issue #NN>

**Branch:** `<feature|bugfix>/<short-slug>`

## Acceptance criteria

> Given/When/Then in domain terms (`AvailabilityClaim` succeeds, `BookingConfirmed` is
> published), never the button, redirect or HTTP status alone. *Seam* is the public boundary
> observed through (port/interface/route, not the class under test). Approval of this list is
> `tdd`'s confirm-seams step.

- [ ] **AC-1:** Given <precondition>, when <action>, then <outcome>. *Seam:* `<…>` · *Pinned by:* `<TestClass>.<method>`

## Non-goals

- <thing the feature might imply but we are not doing>

## Risks

> What could go wrong and how the slice prevents it. Standing risks worth a line when touched:
> concurrent reservation (#2), webhook duplicate/out-of-order (#8), payout double-accrual (#9),
> sales close / cancellation cutoff in `Europe/Tirane` (#4/#6/#10), rounding (#5), BOLA on a
> venue-scoped surface (#13 — how ownership is verified in the service). A Flyway change claims
> `V<n>` per the intake gate.

- **R-1:** <risk> → <mitigation>

## Open questions

> Work is not done while this has unresolved entries. Resolved ones move under `### Resolved`
> with the outcome.

- <question> — *Owner:* <…>

## Availability & concurrency (if booking, the beach map or `availability` is touched)

- **Write paths to `set_availability(set_id, booking_date)`:** <every channel in scope>
- **Concurrency strategy:** <`SELECT … FOR UPDATE` | `INSERT … ON CONFLICT DO NOTHING`, and why>
- **Pool (#3) and cutoff (#4):** <…>
- **Pinning test:** `<ConcurrentReservationIT.<method>>`

## Modulith (if a port, event, module or cross-module call changes)

> Name each new port/event with its owner, consumers and pinning test. Each new capability's
> owner is checked against `RESPONSIBILITIES.md` Job / Not My Job: `booking` decides refunds,
> `payment` executes; `venue` stores the commission rate, `payout` computes.

## Payment & payout (if money moves)

> Load `riviera-stripe-payments`. State the idempotency keys, the ledger effect (accrual on confirm,
> reversal on refund or a day reversal for a stay's refunded day, exactly-once), the refund policy
> applied and the pinning tests.

## Behaviour-parity ledger (if the slice retires or replaces a surface)

| Old-surface behaviour | Verdict | How the new surface does it, or why it's gone |
|---|---|---|

## FE↔BE contract (if an API shape changes)

- **New/changed endpoints:** <method + path + DTO>; money as minor units + currency, dates as ISO
  `LocalDate`; the client never `as any`s the contract.

## Phases

> One reviewable behaviour per phase: the test that goes red first, then the code. No code in
> this doc.

- **Phase 0 — <name>:** <behaviour> · red test `<TestClass.method>`

## Execution status

> The session-recovery anchor: re-read it (plus the current stage's `riviera-sdlc` reference)
> after a compaction or when unsure. Update in the same commit window as what it records.

**Stage pointer:** <e.g. `implement (phase 2)` / `review — fixing findings`>

**Next action:** <one line>

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — <name> | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
