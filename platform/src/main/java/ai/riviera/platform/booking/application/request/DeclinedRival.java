package ai.riviera.platform.booking.application.request;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

/** A pending request the accept of an overlapping one declined; what its {@code BookingRequestDeclined} needs. */
public record DeclinedRival(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate) {
}
