package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * Everything the "the venue declined your request" email renders, structured so each {@link Mailer}
 * decides its own presentation. Plain copy, no call-to-action (product decision 2026-08-01);
 * {@code statusLink} is the code-gated view built by {@link BookingLinks}, rendering
 * {@code DECLINED}. {@code bookingCode} and {@code statusLink} are bearer credentials
 * (invariant #7): mail them, never log them. No amount (nothing was charged; a price by "declined"
 * reads as money moved) and no spot, for {@link PaymentDueMail}'s reason.
 */
public record RequestDeclinedMail(String bookingCode, String venueName, LocalDate bookingDate,
		URI statusLink) {
}
