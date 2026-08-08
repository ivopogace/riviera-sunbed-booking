package ai.riviera.platform.notification.application;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Send one booking's confirmation mail again, on request — the driving port behind the admin
 * console's Resend button, and the lever that replaces "restart the container" as support's only tool.
 *
 * <p><strong>Synchronous, and reporting what actually happened.</strong> The alternative shape — raise
 * an event and let the registry listener carry it — was rejected: it can only answer "queued", the mail
 * bulkhead may shed it, and its main attraction (a registry row to read the history from) disappeared
 * once attempts are recorded directly. The send is bounded by the relay socket budget
 * ({@code riviera.notification.mail.socket-timeout-ms}), so doing it on the caller's thread
 * cannot hang indefinitely, and a human waiting for an answer gets one.
 *
 * <p><strong>A resend is a deliberate duplicate.</strong> It does not consult, and is not gated by, the
 * Event Publication Registry's idempotency for the automatic send — the whole point is to send
 * again a mail that was already handed over. It publishes nothing, so no other {@code BookingConfirmed}
 * consumer runs: the payout accrual (invariant #9) and the Stripe refund path (invariant #8) are
 * untouched by construction, not by convention.
 */
public interface BookingConfirmationResend {

	/** Resend this booking's confirmation, or say why it did not go. Never throws for an expected refusal. */
	ResendOutcome resend(BookingId bookingId);
}
