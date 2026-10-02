# Remodel "nothing left" outcome Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a remodel ends a non-frozen `CONFIRMED` booking with no unrefunded day as **nothing left**
(guarded cancel, held days freed once, a `NOTHING_LEFT` receipt line at amount 0 and fee 0, no
`BookingCancelled`), never as a move, a block or a €0 refund.

**Architecture:** a new `RemodelOutcome` (`NothingLeft`), decided in `RemodelClaimsService#outcomeOf`
after the frozen check and before the move search, off a per-claim "every day refunded" fact read with
the live claims. The refund leg re-reads that fact under the booking row lock, so a day refunded between
classification and the lock settles as nothing left too. No `LayoutWriter` change: the cancelled booking
is no longer live, so the save's probe passes.

**Source of intent:** issue #1300 (decisions settled in #1291's session and the wave prompt).

**Branch:** `bugfix/1300-remodel-nothing-left`

## Acceptance criteria

- [ ] **AC-1 Classification:** Given a non-frozen `CONFIRMED` booking whose every service day is
  refunded, when the remodel classifies it in the move-or-refund or the move-only zone, then it is
  `NothingLeft`, takes no move candidate (a later claim still gets it); one unrefunded day (a €0-share
  day included) classifies as today; a frozen one stays `Blocked(FROZEN)`. *Seam:* `RemodelClaims#classify`
  · *Pinned by:* `RemodelClaimsServiceTest` (nothing-left cases), `RemodelPreviewIT`.
- [ ] **AC-2 Commit:** Given such a claim, when the commit applies, then the booking is `CANCELLED`
  (`VENUE_CHANGE`, refund 0) under its row lock, every still-held day is freed exactly once, one
  `NOTHING_LEFT` line (amount 0, fee 0) is written and no `BookingCancelled` is published. *Seam:*
  `RemodelClaims#commit` · *Pinned by:* `RemodelClaimsServiceTest`, `RemodelCommitIT.aNothingLeftClaim…`.
- [ ] **AC-3 Layout write:** a remodel whose only claim on a removed set is nothing left commits and
  the set retires (no `SETS_IN_USE`). *Seam:* `PUT …/layout/commit` · *Pinned by:* `RemodelCommitIT`.
- [ ] **AC-4 Operator:** the preview lists it under `ended`; the typed refund count and fee total leave
  it out; a nothing-left-only commit needs no confirmation; the receipt reads it back. *Seam:* the preview,
  commit and receipt wire shapes, the preview/receipt panels · *Pinned by:* `RemodelCommitIT`,
  `RemodelReceiptIT`, `remodel-preview-panel.spec.ts`, `remodel-receipt-panel.spec.ts`, `layout-editor.e2e.ts`.
- [ ] **AC-5 Races:** a booking that becomes fully refunded between preview and commit is `Stale`
  (`RemodelCommitIT`/`PreviewTokenTest`); a day refund landing between classification and the refund
  leg's lock settles as nothing left, no €0 refund, no reversal (`CancelVsDayRefundRaceIT`).
- [ ] **AC-6 Stay cancel:** a stay with one nothing-left stretch still cancels its live stretches
  (`CancelStayIT`), `LiveRemainder` unchanged.
- [ ] **AC-7 Docs:** ADR-0026 amendment, `CONTEXT.md` entry, `RESPONSIBILITIES.md` §booking bullets, the
  #1299 wording (`RESPONSIBILITIES.md` remodel-release bullet, `RemodelReleasePaymentListener` Javadoc).

## Non-goals

- The move reminder / review quirks of a fully refunded stretch outside remodels; the guest cancel of a
  fully refunded booking (issue's out of scope). `BookingCancelled`, `LiveRemainder`, `LayoutWriter` unchanged.

## Risks

- **R-1 double release (#2):** the leg frees `ServiceDays.held` (span less venue-released days) once,
  after the guarded cancel succeeds; a lost guard throws and rolls the commit back.
- **R-2 an €0 refund slipping through:** the refund leg decides under the lock off the same fact, so the
  #1281 window lands as `NOTHING_LEFT`; the committed answer reports the settled kind.
- **R-3 a fee or mail for nothing (#9):** no event is published; the line's fee is 0 (V54's CHECK).
- **R-4 migration:** V75 (free on main; no sibling adds one) re-creates the kind CHECK.

## Availability & concurrency

- **Write paths:** `availability.release` for each held day of the ended booking, inside the commit's
  venue-locked transaction, after the guarded `CONFIRMED → CANCELLED`.
- **Strategy:** the booking row lock (`lockById`) before the state read; the cancel guarded on status and
  remainder as the backstop.
- **Pinning:** `CancelVsDayRefundRaceIT.aRemodelRefundWaitingOnTheLastDayRefundSettlesAsNothingLeft`.

## FE↔BE contract

- Preview (`POST …/remodel/preview`), the commit's `200` and its refusal pictures, and the receipt
  (`GET …/remodels/{id}`) gain `ended: [{bookingId, bookingDate, amount, from}]` (the receipt's without `amount`); `releases` keeps only
  `RELEASE`/`DECLINE`.

## Phases

- **Phase 0 — classification + commit leg + V75:** `RemodelClaimsServiceTest` red first.
- **Phase 1 — wire shapes + ITs:** `RemodelCommitIT`, `RemodelReceiptIT`, race IT, `CancelStayIT`.
- **Phase 2 — frontend:** model, panels, specs, mocked e2e.
- **Phase 3 — docs.**

## Execution status

**Stage pointer:** review — re-review of the move-leg fix

**Next action:** post the scoped re-review of the move-leg fix, then Sonar and READY TO MERGE.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — classification + commit leg | ✅ | (this commit) |
| 1 — wire + ITs | ✅ | (this commit) |
| 2 — frontend | ✅ | (this commit) |
| 3 — docs | ✅ | (this commit) |
