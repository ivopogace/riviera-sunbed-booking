package ai.riviera.platform.notification.application;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Send one booking's confirmation mail again: the driving port behind the admin console's Resend
 * button. <strong>Keep it synchronous</strong>, reporting what actually happened (an event could only
 * answer "queued"), bounded by the relay timeout {@code riviera.notification.mail.socket-timeout-ms}.
 *
 * <p><strong>A deliberate duplicate</strong>, not gated by the registry's idempotency for the automatic
 * send. It publishes nothing, so no other {@code BookingConfirmed} consumer (the payout accrual,
 * invariant #9) re-runs. Rationale: {@code RESPONSIBILITIES.md} §notification.
 */
public interface BookingConfirmationResend {

	/** Resend this booking's confirmation, or say why it did not go. Never throws for an expected refusal. */
	ResendOutcome resend(BookingId bookingId);
}
