package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Everything the "your request was accepted — payment is due" email renders (#373, epic #367 story
 * 14) — structured rather than pre-rendered, so each {@link Mailer} decides its own presentation,
 * exactly as {@link BookingConfirmationMail} and {@link BookingCancellationMail} do.
 *
 * <p>{@code payBy} is the whole point of the message and is a UTC {@link Instant}, carried straight
 * off {@code BookingPaymentDue}. It is the moment the abandoned sweep's accepted arm begins expiring
 * this booking, derived from {@code RequestWindows} so the promise and the enforcement are one
 * decision (invariant #6: stored as UTC, and the transports render it in {@code Europe/Tirane},
 * which is the only zone the guest and the venue share).
 *
 * <p>The sweep runs on a fixed delay, so it can act <em>after</em> this instant but never before —
 * which is the direction that makes the deadline safe to state. The copy says "by", not "at".
 *
 * <p>{@code amountMinor} + {@code currency} are integer minor units + ISO 4217 (invariant #5), fixed
 * at request time and unchanged by the accept; the display amount is derived only at the transport.
 *
 * <p>{@code bookingCode} is the arrival credential (invariant #7) — carried both as the booking's
 * reference and as what {@code payLink} is built from. Mailing it is what this whole slice exists to
 * do; logging it is not, and no transport reachable in production does. {@code payLink} is therefore
 * a bearer URL in the same sense the code is, which is why {@link MockMailer} does not echo it the
 * way it echoes a recovery link.
 *
 * <p>No spot ({@code rowLabel}/{@code positionNo}): the guest chose it and has it on screen and in
 * this booking already; the one thing this mail is for is the deadline. Unpublished module-internal
 * value (#382) — public only for the module's own {@code adapter} packages.
 */
public record PaymentDueMail(String bookingCode, String venueName, LocalDate bookingDate,
		Instant payBy, long amountMinor, String currency, URI payLink) {
}
