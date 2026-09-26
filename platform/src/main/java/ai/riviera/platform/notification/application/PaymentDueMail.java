package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * What the "request accepted, payment is due" email renders, structured like
 * {@link BookingConfirmationMail}, whose birth-window and {@code null} rules apply unchanged.
 * {@code payBy} is UTC, rendered in {@code Europe/Tirane} (invariant #6), and derived from the
 * sweep's own {@code RequestWindows}: expiry may come after it, never before, so the copy says "by",
 * not "at". {@code amountMinor} + {@code currency}: minor units + ISO 4217 (invariant #5). The code
 * and its {@code payLink} are bearer credentials (#7): never log them, {@code MockMailer} included.
 */
public record PaymentDueMail(String bookingCode, String venueName, LocalDate bookingDate,
		Instant payBy, long amountMinor, String currency, URI payLink,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps) {
}
