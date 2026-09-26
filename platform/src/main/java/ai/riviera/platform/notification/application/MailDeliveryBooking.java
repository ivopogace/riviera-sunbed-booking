package ai.riviera.platform.notification.application;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * One booking in the admin mail-delivery view, with every recorded attempt at its confirmation mail
 * ({@code attempts}, newest first). {@code everConfirmed} makes an empty list readable: never
 * {@code CONFIRMED} means no mail was due; confirmed means no record (predates the V36 log, or
 * lost). {@code bookingId} is the resend key; {@code venueName} is read via {@code venue::api};
 * {@code bookingDate} is in {@code Europe/Tirane} (invariant #6). No arrival code (invariant #7)
 * and no address (the caller's own input).
 */
public record MailDeliveryBooking(BookingId bookingId, String venueName, LocalDate bookingDate,
		boolean everConfirmed, List<MailAttempt> attempts) {
}
