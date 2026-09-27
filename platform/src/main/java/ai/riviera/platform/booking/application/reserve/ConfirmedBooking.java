package ai.riviera.platform.booking.application.reserve;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The booking facts a confirm transition yields via SQL {@code RETURNING}, so the single confirm seam
 * builds the {@code BookingConfirmed} payload atomically with the transition: the webhook path holds
 * only a {@code bookingId}, and a second read would race. Ids are typed (invariant #11); money is
 * integer minor units + ISO currency (invariant #5); {@code stayId} is null for a lone booking.
 */
public record ConfirmedBooking(long id, VenueId venueId, SetId setId, LocalDate bookingDate,
		LocalDate lastDate, Instant createdAt, long amountMinor, String currency, StayId stayId) {
}
