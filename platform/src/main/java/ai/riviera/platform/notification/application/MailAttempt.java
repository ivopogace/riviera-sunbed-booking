package ai.riviera.platform.notification.application;

import java.time.Instant;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * One booking-confirmation mail attempt and what became of it — a delivery-history row. It holds no
 * recipient address ({@code customer}, ADR-0010) and no arrival code (invariant #7).
 *
 * @param bookingId the booking whose confirmation this attempt was for
 * @param source what triggered it — the registry listener, or an admin
 * @param outcome what became of it
 * @param attemptedAt the UTC instant of the attempt (invariant #6)
 */
public record MailAttempt(BookingId bookingId, MailAttemptSource source, MailAttemptOutcome outcome,
		Instant attemptedAt) {
}
