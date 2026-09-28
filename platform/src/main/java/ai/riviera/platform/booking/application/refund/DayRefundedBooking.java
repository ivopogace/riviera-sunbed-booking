package ai.riviera.platform.booking.application.refund;

import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The facts {@link Bookings#refundDay}'s guarded stamp returns for the event: the booking, its venue
 * and set, the currency of the amount stamped and the stay it belongs to ({@code null} when lone).
 */
public record DayRefundedBooking(long id, VenueId venueId, SetId setId, String currency, StayId stayId) {
}
