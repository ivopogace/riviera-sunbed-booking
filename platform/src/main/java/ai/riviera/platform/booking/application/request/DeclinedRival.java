package ai.riviera.platform.booking.application.request;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A pending request an accept declined as a rival: a lone one's {@code BookingRequestDeclined} needs its
 * set and days; a stay's stretch carries its {@code stayId} (null for a lone request), declined whole.
 */
public record DeclinedRival(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate, StayId stayId) {
}
