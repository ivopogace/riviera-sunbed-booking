package ai.riviera.platform.notification.application;

import java.time.Instant;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * One booking-confirmation mail attempt and what became of it (#380) — a row of the delivery history
 * an admin reads, and the whole of what this module records about a send.
 *
 * <p>Deliberately four fields. There is no recipient address (it stays inside {@code customer},
 * ADR-0010) and no arrival code (invariant #7); the booking id is the key, and the address is resolved
 * live at display time.
 *
 * @param bookingId the booking whose confirmation this attempt was for
 * @param source what triggered it — the registry listener, or an admin
 * @param outcome what became of it
 * @param attemptedAt the UTC instant of the attempt (invariant #6)
 */
public record MailAttempt(BookingId bookingId, MailAttemptSource source, MailAttemptOutcome outcome,
		Instant attemptedAt) {
}
