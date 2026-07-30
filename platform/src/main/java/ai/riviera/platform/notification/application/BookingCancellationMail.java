package ai.riviera.platform.notification.application;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;

/**
 * Everything the cancellation/refund email renders (#374, epic #367 story 15) — structured, not
 * pre-rendered, so each {@link Mailer} implementation decides its own presentation, exactly as
 * {@link BookingConfirmationMail} does.
 *
 * <p>{@code refundMinor} + {@code currency} are integer minor units + ISO 4217 (invariant #5),
 * carried straight off {@code BookingCancelled}. The number is the <strong>server-computed refund
 * decision</strong> ({@code CancellationPolicy.quote} for a tourist cancellation, the gross amount
 * for a weather refund — invariant #10, ADR-0005); nothing here recomputes it, and the display
 * amount is derived only at the transport. <strong>Zero is a real value</strong>, not a missing one:
 * a cancellation after the invariant-#4 cutoff refunds nothing, and the transports render that as
 * words rather than as {@code EUR 0.00}, which would read as a refund.
 *
 * <p><strong>It states a decision, not a settlement.</strong> The event fires when the booking is
 * cancelled; the money is returned afterwards by {@code booking}'s own {@code BookingCancelled}
 * listener through {@code payment}'s {@code RefundPort}, which can still fail
 * ({@code riviera.refunds.failed}). So the copy says the refund is on its way back, never that it
 * has arrived — a "your refund has settled" mail would need a fact no event carries today.
 *
 * <p>{@code reason} is {@code booking}'s published vocabulary rather than a local copy, so a fourth
 * constant becomes a compile error in the transports (which switch over it exhaustively) instead of
 * a silently blank line. It is what lets one event serve both cancellation channels while the tourist
 * still learns which happened — a weather cancellation is one they never asked for.
 *
 * <p>{@code bookingCode} is the arrival credential (invariant #7), carried as the booking's
 * reference so a tourist holding several knows which one this is. Mailing it is no new exposure —
 * the confirmation already sent it to this address, and the code unlocks nothing once the booking is
 * {@code CANCELLED} — but it must never be logged, and no transport reachable in production does.
 *
 * <p>No spot ({@code rowLabel}/{@code positionNo}): the set is released, so it is not a fact this
 * reader needs. Unpublished module-internal value (#382) — public only for the module's own
 * {@code adapter} packages.
 */
public record BookingCancellationMail(String bookingCode, String venueName, LocalDate bookingDate,
		long refundMinor, String currency, RefundReason reason) {
}
