package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Published when a remodel commit re-seats a live booking on another set of its venue, in the
 * transaction that also wrote the layout, the availability rows and the receipt. The booking keeps
 * its code, price and status; {@code notification} mails the guest their changed spot, resolving the
 * code, both labels, the distance and the free-exit deadline through {@code booking.api} (the code
 * never rides an event, invariant #7). Id-based payload (invariant #11): the booking, its venue, the
 * set it left and the set it now holds, and its service day ({@code Europe/Tirane}, invariant #6).
 */
public record BookingMoved(BookingId bookingId, VenueId venueId, SetId fromSetId, SetId toSetId,
		LocalDate bookingDate) {
}
