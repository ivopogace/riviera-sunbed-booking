package ai.riviera.platform.notification.application;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * One booking in the admin mail-delivery view (#380), with everything that happened to its
 * confirmation mail.
 *
 * <p>{@code everConfirmed} is what makes an empty {@code attempts} list readable: for a booking that
 * never reached {@code CONFIRMED} no mail was ever due, while for a confirmed one an empty list means
 * the platform has no record — either it predates the log (V36) or the record itself was lost. Those
 * are different answers and the surface must not blur them.
 *
 * <p>No arrival code (invariant #7) and no address: the address is the caller's own input, and the code
 * is a bearer credential this view has no reason to show.
 *
 * @param bookingId the booking, and the key a resend is addressed to
 * @param venueName the venue's display name, read live through {@code venue::api}
 * @param bookingDate the booked day (a {@code LocalDate} in {@code Europe/Tirane}, invariant #6)
 * @param everConfirmed whether a confirmation mail was ever due for this booking
 * @param attempts every recorded attempt, newest first; empty when nothing was recorded
 */
public record MailDeliveryBooking(BookingId bookingId, String venueName, LocalDate bookingDate,
		boolean everConfirmed, List<MailAttempt> attempts) {
}
