# Multi-day stays 11/12 — during a stitched stay: move reminder, "your spot today", staff scan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** A move day inside a stitched stay reads like any other morning: the guest is told the
evening before where tomorrow's set is and how far, the booking page leads with today's set, and
the staff scan names today's set even on a second scan.

**Architecture:** `booking` decides *when* a move is due (a sweep in `Europe/Tirane` stamps the
arriving stretch's `move_reminder_at` under a guarded `UPDATE` and publishes `StayMoveDue`);
`notification` renders and sends on the registry vehicle exactly as the moved mail does, resolving
the facts through `booking::api` at send time. "Your spot today" is a frontend derivation over the
stretches the code-gated view already carries, with today taken in `Europe/Tirane`.

**Source of intent:** `docs/architecture/multi-day-stays.md` § D13 (stories 22, 23, 36); issue #1209.

**Branch:** `claude/tailwind-angular-frontend-uwd3rq` (the cloud session's designated branch, standing
in for `feature/stay-today`).

## Intake notes (gate outcome, 2026-09-27)

- **Staff scan (story 36) is already half-built.** #1208's check-in resolves a stay's code to today's
  stretch (`StayCheckInIT.aMoveDayChecksTheGuestIntoTodaysStretch`), and the daily view labels the
  returned `setId` off the loaded map ("Checked in — A · 3"). What is missing: a second scan of a stay's
  code answers "this code was used before", which is false for a stay (it is used every morning), and
  names no set, so staff cannot point the guest to the lounger on a re-scan. The slice carries today's
  set on `ALREADY_CHECKED_IN` and fixes the copy.
- **"Delivery log honoured" in the issue is drift.** `booking_confirmation_mail_attempt` is the
  confirmation mail's log (admin resend), keyed per booking with no kind and no uniqueness — V36's
  header says a second kind must generalise the table. The moved, cancellation and payment-due mails
  write no log; idempotency is the registry's plus the producer's guard. The reminder follows the
  moved mail: suppression at the chokepoint, an abandon counter, no log row. Exactly-once comes from
  `booking`'s guarded stamp.
- **Issue comment on promoting the itinerary plan port:** not needed. Both stretches of a move are
  `booking` rows; the reminder never asks `itinerary` anything.
- **In flight:** only dependabot PRs. Flyway `V65` is the top on `main`; `V66` is free and claimed here.
- **Previous sibling's close-out:** slice 12/12 (#1259 via PR #1260) is merged; its epic comment is
  present. Slice 10's (#1208) follow-ups #1255/#1256/#1257 are merged.

## Acceptance criteria

- [ ] **AC-1:** Given a `CONFIRMED` stitched stay whose stretch on set A ends on D and whose stretch on
  set B starts on D+1, when the sweep runs at or after the send hour (default 18:00 `Europe/Tirane`)
  on D, then exactly one `StayMoveDue(stayId, arrivingBookingId, D+1)` is published and the arriving
  stretch is stamped; a second run publishes nothing. *Seam:* `RemindStayMoves#sweep` (booking
  application port) · *Pinned by:* `StayMoveReminderIT.theEveningBeforeAMoveAnnouncesItOnce`.
- [ ] **AC-2:** Given the same stay, when the sweep runs before the send hour on D, or on D−1, or on
  D+1, then nothing is published; the first stretch (no predecessor) never announces. *Seam:*
  `MoveReminderWindow` (domain rule) + the sweep · *Pinned by:* `MoveReminderWindowTest`,
  `StayMoveReminderIT.nothingIsDueOutsideTheEveningBefore`.
- [ ] **AC-3:** Given a stay cancelled whole, or a move whose arriving stretch a remodel ended, or whose
  two stretches now share one set, when the sweep runs on the evening before, then nothing is published.
  *Seam:* the sweep · *Pinned by:* `StayMoveReminderIT.aCancelledStayAndAnEndedStretchGetNoReminder`.
- [ ] **AC-4:** Given `StayMoveDue`, when the listener runs, then one reminder mail leaves the mock
  transport carrying the stay's code, the venue, tomorrow's date, today's spot, tomorrow's spot, the
  distance (rows and positions) and the code-gated link; a suppressed address gets none and the
  publication completes; the mock outbox read never shows the code. *Seam:* `StayMoveDue` →
  `Mailer#sendMoveReminder` · *Pinned by:* `MoveReminderMailIT`.
- [ ] **AC-5:** Given a stay with stretches, when the booking page is opened on the first day, on a
  move day and on the last day (clock fixed in `Europe/Tirane`), then it leads with that day's set,
  dims stops whose last day has passed, and marks the stop after today's as the next move; a stay that
  has not started shows its first spot and date; a lone booking shows no lead. *Seam:*
  `GET /api/bookings/{code}` → `app-booking-view` · *Pinned by:* `booking-view.spec.ts`
  (`your spot today`), `stay-today.e2e.ts`.
- [ ] **AC-6:** Given a stay's code scanned twice on a move day, when the second scan answers
  `ALREADY_CHECKED_IN`, then the problem carries today's `setId` and the daily view says
  "Already checked in today — B · 9". *Seam:* `CheckInBooking` → `POST …/check-in` ·
  *Pinned by:* `StayCheckInIT.aSecondScanNamesTodaysSet`, `daily-view-tab.spec.ts`,
  `operator-daily.e2e.ts`.
- [ ] **AC-7:** No new log line, metric tag or problem body carries a booking or stay code (#7).
  *Seam:* the listener's `abandon`, the sweep's log · *Pinned by:* review + `MoveReminderMailIT`'s
  outbox assertion.

## Non-goals

- A reminder for a lone multi-day booking, or on the stay's first day (nothing moves).
- Consolidation offers, per-day weather refunds, mid-stay guest cancellation (other slices / decisions).
- Carrying the set label on the check-in `200`: the daily view already resolves it off the map.
- A push or SMS channel; the reminder is mail, like every other transactional notice.

## Risks

- **R-1: Double reminder across instances or re-runs (exactly one per move).** The stamp is a guarded
  `UPDATE booking SET move_reminder_at = :now WHERE id = :id AND move_reminder_at IS NULL AND
  status = 'CONFIRMED' RETURNING …`, one transaction per row with the publish inside it, so the
  registry row and the stamp commit together; a loser matches nothing (ADR-0018).
- **R-2: Wrong day (#6).** "The evening before" is computed from the injected UTC `Clock` in
  `Europe/Tirane`: the move day is due iff `today + 1 = moveDay` and local time ≥ the send hour.
  Unit-tested with fixed instants either side of the hour and of midnight (`MoveReminderWindowTest`).
- **R-3: A fourth `booking` scheduler (B3 pressure).** The sweep is one small class mirroring
  `NoShowSweepScheduler` (`fixedDelay`, an `enabled` test-isolation seam). Noted for the B3 decision;
  not this slice's.
- **R-4: The evening's mail races the remodel.** A move commit after the reminder re-seats the stretch
  and mails `BookingMoved` on its own; the reminder named the spot as it stood. Accepted, like the
  confirmation mail.
- **R-5: Set geometry.** The distance is computed off `SetBookingFacts#activeSetsOf` placements at
  announce time; both stretches are `CONFIRMED` so both sets are active (a remodel that retires a set
  moves or ends the stretch first). A missing placement abandons with `NO_SET`.
- **R-6: Frontend "today" (#6).** Taken once per load via `todayBookingDate(new Date())` (Intl,
  `Europe/Tirane`), never `toISOString()`; the e2e fixes the clock with `page.clock.setFixedTime`.
- **R-7: Dimmed ink must stay AA.** Past stops use the proven `text-riv-card-ink-faint`; the next-move
  chip uses the accent chip tokens. `booking-view.contrast.spec.ts` asserts the faint ink over the card.

## Open questions

### Resolved

- **Send hour** — 18:00 `Europe/Tirane` by default, configurable (`booking.move-reminder.send-from`).
  Matches the cancellation cutoff's default evening. *Owner may retune.*
- **A move whose day-before stretch was ended by a remodel** — no reminder: there is no "today's set"
  to measure from, and the guest holds that stretch's cancellation mail plus the stay's confirmation.
- **"Your spot today" for a lone booking** — not shown; the story's problem is a list of ranges.
- **Re-scan copy** — "Already checked in today — B · 9." carries the set; behaviour (409) unchanged.
- **Late instance (sweep misses the evening)** — a move day that is already today is not announced;
  the copy says "tomorrow" and must stay true. Owner may widen later.

## Availability & concurrency

The slice writes no `set_availability` row and claims nothing. The only new write is the stamp on
`booking.move_reminder_at`, guarded as R-1. Check-in's lock order (the booking row, then its day
rows) is untouched; `findCheckInFacts` only gains `set_id` in its select list.

## Modulith

- **New column** `booking.move_reminder_at TIMESTAMPTZ NULL` (V66); `booking` sole writer, as for every
  `booking` column. No new table.
- **New event** `booking.events.StayMoveDue(StayId stayId, BookingId bookingId, LocalDate moveDate)` —
  id-based (#11), published by `booking` inside the stamp's transaction; consumed by
  `notification.adapter.in.StayMoveReminderMailListener` (`@Async(MAIL_EXECUTOR)` +
  `@TransactionalEventListener`; joins `MailListenerExecutorArchitectureTest`'s list).
- **`booking::api` grows** `BookingNotificationFacts#moveReminderFacts(BookingId)` →
  `Optional<StayMoveFacts>` (`booking.vocabulary`: stay id, code, customer id, move date, stay last day,
  from/to set ids, rows and positions away). Same consumer conversation as `moveFacts`, so it joins
  that port rather than opening a new one.
- **`venue::vocabulary`** `SetPlacement` gains `rowsAway(SetPlacement)` / `positionsAway(SetPlacement)`:
  the geometry rule now has three callers (`MoveRanking`, `ItinerarySearch`, the reminder facts), so
  it earns a named holder at its owner. The two existing callers switch to it; their tests are the
  oracle.
- **New ports inside `booking.application`:** `RemindStayMoves` (the sweep) and `StayMoveAnnouncer`
  (the per-row stamp + publish, `@Transactional public`, the `PaymentDueAnnouncer` shape).
  `Bookings` gains `findStayMovesDue(LocalDate moveDay)` and `stampMoveReminder(long bookingId,
  Instant at)`.
- **`domain/MoveReminderWindow`** — the "evening before" choice as a pure rule (JDK only).
- **Observability:** `ObservabilityMetrics.MAIL_MOVE_REMINDER_ABANDONED`
  (`riviera.mail.move-reminder.abandoned`), a row in `docs/runbooks/observability.md`.
- **Transport:** `Mailer#sendMoveReminder(String, MoveReminderMail)`; `MockMailer` records a
  `SentEmail.Kind.MOVE_REMINDER`; `SmtpMailer` renders it; the mock outbox read shows it code-free.
- Owner check against `RESPONSIBILITIES.md`: `booking` owns when (its lifecycle fact), `notification`
  owns delivery and decides nothing, `venue` owns geometry. No `itinerary` involvement.

## FE↔BE contract

- `POST /api/venues/{venueId}/bookings/{code}/check-in` — the `409 ALREADY_CHECKED_IN` problem gains
  `setId` (number) beside `bookingDate`. The `200` body is unchanged.
- `GET /api/bookings/{code}` — unchanged; the page derives today from `stretches`.

## Phases

- **Phase 0 — geometry rule:** `SetPlacement#rowsAway/positionsAway`, `MoveRanking` and
  `ItinerarySearch` call it · red test `SetPlacementTest`, existing ranking tests green unchanged.
- **Phase 1 — the window rule:** `MoveReminderWindow.dueMoveDay(now, sendFrom)` · red test
  `MoveReminderWindowTest`.
- **Phase 2 — the sweep:** V66, `Bookings#findStayMovesDue/stampMoveReminder`, `StayMoveAnnouncer`,
  `RemindStayMoves`, `StayMoveDue`, `MoveReminderScheduler` + properties · red tests
  `StayMoveReminderIT`, `MoveReminderPropertiesTest`, `MoveReminderSchedulerConfigTest`.
- **Phase 3 — the facts:** `BookingNotificationFacts#moveReminderFacts` · red test
  `StayMoveFactsIT`.
- **Phase 4 — the mail:** `MoveReminderMail`, `Mailer#sendMoveReminder`, listener, mock/SMTP/outbox,
  metric + runbook · red test `MoveReminderMailIT`, listener unit test.
- **Phase 5 — staff re-scan:** `CheckInFacts.setId`, `AlreadyCheckedIn(bookingDate, setId)`, the
  problem's `setId`, daily view copy · red tests `StayCheckInIT.aSecondScanNamesTodaysSet`,
  `daily-view-tab.spec.ts`, `operator-daily.e2e.ts`.
- **Phase 6 — "your spot today":** the lead, dimmed past stops, next-move chip · red tests
  `booking-view.spec.ts`, `booking-view.contrast.spec.ts`, `stay-today.e2e.ts`.
- **Phase 7 — docs:** `RESPONSIBILITIES.md` §booking/§notification, `CLAUDE.md` event inventory,
  `CONTEXT.md` (*Move reminder*), issue AC note on the delivery log; plan retired in the last commit.

## Execution status

**Stage pointer:** `PR #1263 — draft open, CI gate pending`

**Next action:** watch the first CI run; then merge `origin/main`, mark ready, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — geometry rule | ✅ | 49a775a |
| 1 — window rule | ✅ | 49a775a |
| 2 — sweep | ✅ | d8dedc9 |
| 3 — facts | ✅ | 15abf81 |
| 4 — mail | ✅ | 15abf81 |
| 5 — staff re-scan | ✅ | 51b0b16 |
| 6 — your spot today | ✅ | 268914e |
| 7 — docs + retire plan | ⏳ | docs landed; the plan retires in the PR's last commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
