package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;

/**
 * Everything the "the venue declined your request" email renders, structured so each {@link Mailer}
 * decides its own presentation. Plain copy, no call-to-action. {@code statusLink} is the code-gated
 * view ({@link BookingLinks}) rendering {@code DECLINED}; it and {@code bookingCode} are bearer
 * credentials (invariant #7): mail them, never log them. No amount (nothing was charged; a price by
 * "declined" reads as money moved) and no spot, for {@link PaymentDueMail}'s reason.
 */
public record RequestDeclinedMail(String bookingCode, String venueName, LocalDate bookingDate,
		URI statusLink) {
}
