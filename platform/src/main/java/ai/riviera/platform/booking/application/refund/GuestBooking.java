package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * One of a guest's bookings as the admin's day-refund lookup lists it: the id the refund is addressed to,
 * the venue's name (read via {@code venue::api}), the span in {@code Europe/Tirane} (#6), the lifecycle
 * status and each service day's state — never the code (#7) nor the contact.
 */
public record GuestBooking(BookingId bookingId, String venueName, LocalDate firstDate, LocalDate lastDate,
		BookingStatus status, List<GuestBookingDay> days) {
}
