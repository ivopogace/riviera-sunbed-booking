# A moved stretch shows its move notice in the stay view — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a stitched stay whose stretch a remodel moved reads, on `GET /api/bookings/{code}` and in
its move mail, which stretch moved, from where to where, and a free-exit deadline the cancel will
actually honour.

**Architecture:** the move rides on each `StretchView` (null when unmoved); the top-level `move`
stays null for a stay, because its `rowLabel`/`positionNo` are the first stretch's. A stretch's
free exit is capped where its stay's cancellation closes (the stay's first-day midnight), in the one
place `BookingCutoff` derives it, so the view, the cancel quote and the mail cannot disagree. Money
does not change.

**Source of intent:** #1257 (parent #1096, `docs/architecture/multi-day-stays.md` § D6, ADR-0024).

**Branch:** `claude/sdlc-1257-tailwind-angular-p8e193` (cloud session; stands in for
`feature/stay-move-notice`).

## Acceptance criteria

- [ ] **AC-1:** Given a confirmed two-stretch stay whose second stretch a remodel moved
  (`RemodelClaims.commit`), when the guest views the stay by code, then that stretch carries its
  move (from-spot snapshot, distance, `movedAt`, free-exit deadline), the first carries none, the
  top-level `move` is null and `cancellable`/`refundIfCancelledNow` are unchanged. *Seam:*
  `ViewBooking.byCode` + `GET /api/bookings/{code}` · *Pinned by:*
  `ViewStayIT.aMovedStretchCarriesItsMoveNotice`, `ViewBookingServiceTest` (stay arms).
- [ ] **AC-2:** Given a later stretch moved before its stay began, when it is quoted on the stay's
  first day, then its free-exit deadline is the stay's first-day midnight (`Europe/Tirane`) and
  never later, and the refund is what it was before this slice. *Seam:*
  `CancellationPolicy.quote(booking, windowDay)` · *Pinned by:*
  `CancellationPolicyFreeExitTest`, `BookingCutoffFreeExitTest`.
- [ ] **AC-3:** Given a moved stretch, when `BookingMoved` is mailed, then the mail names the
  stay's code (never the row code), the stretch's days, and the capped deadline, worded so only
  the moved days are promised in full. *Seam:* `BookingMoved` → `notification` (mock outbox) ·
  *Pinned by:* `BookingMovedMailIT.aMovedStretchIsMailedWithTheStaysCodeAndTheStaysExit`,
  `SmtpMailerIT`.
- [ ] **AC-4:** Given a stretch moved after its stay began (the stay can no longer be cancelled),
  when mailed and viewed, then no free exit is promised: the mail says the stay can no longer be
  cancelled and the view's stretch move has no deadline. *Seam:* as AC-3 and AC-1 · *Pinned by:*
  `BookingMovedMailIT.aStretchMovedAfterItsStayBeganPromisesNoExit`, `SmtpMailerIT`,
  `CancellationPolicyFreeExitTest`.
- [ ] **AC-5:** Given a stay payload with a moved stretch, when the booking view renders, then the
  "Your spot changed" notice names the stop, its days, both spots and the distance, adds the
  free-exit deadline while the stay is cancellable, and the stop list marks that stop as moved.
  *Seam:* `BookingView` component · *Pinned by:* `booking-view.spec.ts`, mocked
  `e2e/moved-booking.e2e.ts` (+ axe).

## Non-goals

- Moving or re-planning a whole stay after a remodel; cancelling one stretch alone.
- Changing any refund: the free exit stays a per-stretch tier override judged on the stay's first
  day (ADR-0005, invariant #10).
- The planned between-stretch move reminder (#1209).

## Risks

- **R-1 — a displayed deadline the cancel won't honour (#10).** A later stretch's own free exit
  (noon the day before *its* start) runs past the stay's first-day midnight, when the whole stay
  becomes `CLOSED`. → Cap in `BookingCutoff`; `CancellationPolicy` and the mail's `moveFacts` both
  call it. The cap cannot change money: a non-`CLOSED` window already means now is before that
  midnight.
- **R-2 — "full refund" over-promises for a stay.** Cancelling is whole-stay; only the moved
  stretch gets the override, the rest take the stay's tier. → Stretch-specific copy in the mail and
  the view names the moved days as the ones refunded in full.
- **R-3 — code leak (#7).** The mail and view already resolve `COALESCE(stay.code, booking.code)`;
  the IT asserts the row code never appears.

## Open questions

### Resolved

- Does the move mail already name the stay's code? Yes, since #1208 (`notificationInfo`'s
  `COALESCE`); this slice pins it with an IT. — resolved from code.
- A stretch moved after its stay began: offer a per-stretch exit, or none? None: the issue keeps
  `cancellable`/`refundIfCancelledNow` as they are, and ADR-0005 never reopens `CLOSED`, so the mail
  and view stop promising one. ← confirm? (decided in-slice; flagged on the PR)

## FE↔BE contract

- `GET /api/bookings/{code}`: `stretches[i].move` — `MoveView | null`, the same shape as the
  top-level `move` (`fromRowLabel`, `fromPositionNo`, `rowsAway`, `positionsAway`, `movedAt`,
  `freeExitUntil`); the stretch's own `rowLabel`/`positionNo` are the new spot. FE
  `StayStretchView.move?` is optional (the `POST /api/stays` response has none).

## Phases

- **Phase 0 — the stretch's free exit ends with its stay's window:** red
  `BookingCutoffFreeExitTest` + `CancellationPolicyFreeExitTest` (later stretch, pre-stay; stay
  begun).
- **Phase 1 — the stay view carries each stretch's move:** red `ViewBookingServiceTest` stay arm,
  then `ViewStayIT.aMovedStretchCarriesItsMoveNotice` over a real remodel commit.
- **Phase 2 — the stretch's move mail:** red `BookingMovedMailIT` (stay code + capped deadline;
  no exit once begun), `SmtpMailerIT` (stretch and no-exit copy), `BookingMovedMailListenerTest`.
- **Phase 3 — the booking view shows it:** red `booking-view.spec.ts` (notice per moved stop, list
  mark, free exit only while cancellable), then `e2e/moved-booking.e2e.ts` stay test (+ axe).
- **Phase 4 — docs + close-out:** `RESPONSIBILITIES.md` §booking free-exit line; design-doc status;
  delete this plan.

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** red `BookingMovedMailIT` for a moved stretch (stay code, capped deadline).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — stretch free exit capped | ✅ | phase-0 commit |
| 1 — stay view per-stretch move | ✅ | phase-1 commit |
| 2 — stretch move mail | ⏳ | |
| 3 — booking view | | |
| 4 — docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
