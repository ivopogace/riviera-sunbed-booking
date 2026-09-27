# One confirmation mail for a stitched stay — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a stitched stay's guest receives exactly one confirmation mail, after every stretch is
`CONFIRMED`, naming every stop's days and spot, the stay's code and total; a lone booking's mail
is unchanged.

**Architecture:** `booking` decides "this confirm completed the stay" inside the confirming
transaction — the stay row is locked `FOR UPDATE` before counting unconfirmed stretches, so of N
concurrent webhook confirms exactly one sees the stay complete — and publishes a new id-based
`StayConfirmed`. `notification` mails the stay on it and skips `BookingConfirmed` for a stretch
(`BookingConfirmed.stayId`, null for a lone booking and for every pre-deploy payload). No new table:
the delivery log keeps its per-booking grain, one row per stretch the stay mail covers.

**Source of intent:** issue #1255 (epic #1096, story 15; `docs/architecture/multi-day-stays.md`
§ D6; ADR-0024 consequence 1).

**Branch:** `claude/sdlc-1255-4ipccm` (stands in for `feature/stay-confirmation-mail`).

## Acceptance criteria

- [ ] **AC-1:** Given a stay of two stretches `AWAITING_PAYMENT`, when a verified `PaymentConfirmed`
  arrives for each (separate listener transactions), then exactly one `STAY_CONFIRMATION` mail
  reaches the guest contact, naming the stay code, venue, the stay's span, each stop's days + row +
  position, and the summed total — and no per-stretch `BOOKING_CONFIRMATION`. *Seam:* the registry
  (`PaymentConfirmed` → `booking` → `StayConfirmed` → `MockMailer`). *Pinned by:*
  `StayConfirmationMailIT.mailsTheStayOnceAfterEveryStretchConfirms`.
- [ ] **AC-2:** Given N stretches confirmed concurrently, when every confirm commits, then exactly
  one `StayConfirmed` is published. *Seam:* `ConfirmBooking.confirmFromPayment`. *Pinned by:*
  `StayConfirmationMailIT.concurrentStretchConfirmsMailOnce` (registry-observed; `StayConfirmedPublicationIT` pins the sequential and one-go cases).
- [ ] **AC-3:** Given a lone booking, when it confirms, then its mail equals today's
  `BookingConfirmationMail` and `BookingConfirmed.stayId` is null. *Seam:* registry → `MockMailer`.
  *Pinned by:* existing `BookingConfirmationMailIT` (unchanged, still green).
- [ ] **AC-4:** Given a confirmed stay, when an admin presses resend on any stretch, then the stay
  mail is sent again and an `ADMIN_RESEND` attempt is recorded on every stretch. *Seam:*
  `POST /api/admin/mail-deliveries/{bookingId}/resend`. *Pinned by:*
  `StayConfirmationMailIT.adminResendOnAStretchResendsTheStayMail` +
  `BookingConfirmationResendServiceTest`.
- [ ] **AC-5:** The stay mail carries the stay's code, never a stretch's row code (invariant #7);
  nothing logs either. *Seam:* `MockMailer` payload. *Pinned by:* AC-1's equality on the mail
  record (stay code), `SmtpMailerIT.stayConfirmation…` (body).
- [ ] **AC-6:** A resubmitted, already-completed `StayConfirmed` publication sends no second mail.
  *Pinned by:* `StayConfirmationMailIT.doesNotResendWhenACompletedPublicationIsResubmitted`.

## Non-goals

- Listing a stay's stops in the admin mail-delivery view (it stays per booking; each stretch row
  shows the stay mail's attempts).
- A stay-level cancellation or moved mail (still per stretch).
- Request-to-Book stays (not yet bookable).

## Risks

- **R-1: two stretch confirms each see the other uncommitted → no mail; or both see all confirmed →
  two mails.** → the completing check locks the `stay` row `FOR UPDATE` first; under READ COMMITTED
  the count after the lock sees every earlier committed confirm. Lock order is booking row → stay
  row; the cancel path locks booking rows only, so no cycle. Pinned by AC-2.
- **R-2: a partially confirmed stay never mails.** One PaymentIntent collects every share, and the
  sweep voids the intent before releasing, so the stretches settle together; the stub path confirms
  all in one transaction. Accepted: no partial trigger.
- **R-3: deploy with publications in flight.** A pre-deploy `BookingConfirmed` has no `stayId` →
  mailed per stretch as before; nothing is lost. A `StayConfirmed` is only published by new code.
- **R-4: invariant #7.** `StayConfirmed` carries ids + the birth window only; the code is read at send
  time through `BookingNotificationFacts`, and no log line names it.
- **R-5: lone-booking byte-identity.** The lone path, `BookingConfirmationMail` and the SMTP body are
  untouched; the stay has its own mail record and body.

## Modulith

- **`booking.events.StayConfirmed(StayId, CancellationWindow, int lateCancelRefundBps)`** — owner
  `booking` (sole writer of `stay`/`booking`), published from `ConfirmBookingService` (the single
  confirm seam); consumer `notification` (already granted `booking::events` + `::vocabulary`). The
  birth window is the first stretch's (ADR-0024 §4: a stay is judged on its first day), frozen like
  `BookingConfirmed`'s.
- **`BookingConfirmed` gains a trailing nullable `StayId stayId`**; `payout` ignores it.
- **`BookingNotificationFacts` (existing notification conversation) gains
  `stayConfirmationFacts(StayId)` and `stayConfirmationFactsOf(BookingId)`** returning
  `booking.vocabulary.StayConfirmationFacts` (code, customer, stops, total, everConfirmed, window).
- Owner check: the "stay is complete" decision is a booking lifecycle fact → `booking`; the mail,
  its log and resend → `notification`. No new dependency edge.

## Phases

- **Phase 0 — booking publishes `StayConfirmed` once:** red `StayConfirmedPublicationIT`.
- **Phase 1 — stay confirmation facts port:** red `StayConfirmationFactsIT` (booking adapter).
- **Phase 2 — notification mails the stay, skips stretches:** red `StayConfirmationMailIT`
  (AC-1/5/6), `SmtpMailerIT` stay body.
- **Phase 3 — admin resend of a stay:** red `BookingConfirmationResendServiceTest` + IT (AC-4).
- **Phase 4 — docs:** `RESPONSIBILITIES.md` §booking/§notification, `CLAUDE.md` event list,
  ADR-0024 consequence, design-doc status, `CONTEXT.md` if a term lands.

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** red IT for the stay confirmation facts port.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — StayConfirmed | ✅ | phase 0 commit |
| 1 — facts port | ⏳ | |
| 2 — stay mail | | |
| 3 — resend | | |
| 4 — docs | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
