package ai.riviera.platform.booking.application.refund;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;

/** {@link GuestBookingDays}' row: a {@link GuestBooking} before its set is resolved to a venue name. */
public record GuestBookingRow(BookingId bookingId, SetId setId, LocalDate firstDate, LocalDate lastDate,
		BookingStatus status, List<GuestBookingDay> days) {
}
