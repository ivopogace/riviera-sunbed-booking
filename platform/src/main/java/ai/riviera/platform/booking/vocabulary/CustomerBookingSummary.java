package ai.riviera.platform.booking.vocabulary;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * One of a guest contact's bookings, as the admin mail-delivery view lists them. No status (keeps
 * {@code BookingStatus} internal, RESPONSIBILITIES.md §booking), code (invariant #7) or contact.
 *
 * @param bookingId the booking, and the key an admin resend is addressed to
 * @param setId the set; the venue name comes via {@code venue.api.SetBookingFacts}, as for mails
 * @param bookingDate the booked day, in {@code Europe/Tirane} (invariant #6)
 * @param everConfirmed ever {@code CONFIRMED}; see {@link BookingConfirmationFacts#everConfirmed()}
 */
public record CustomerBookingSummary(BookingId bookingId, SetId setId, LocalDate bookingDate,
		boolean everConfirmed) {
}
