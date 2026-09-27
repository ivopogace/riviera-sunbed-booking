package ai.riviera.platform.itinerary.application;

import ai.riviera.platform.venue.vocabulary.BookingMode;

/**
 * The move budget (design D13): the most moves a stitched plan may ask of a guest, from
 * {@code riviera.itinerary.max-switches}; three is the default and the ceiling, past it a venue
 * cannot host the stay. Bound by {@code ItineraryProperties}. A Request-to-Book venue's budget is
 * zero: it takes one set per request, never a plan (#1203), so it reads same set or can't host.
 */
public record MoveBudget(int maxMoves) {

	public int forVenue(BookingMode bookingMode) {
		return bookingMode == BookingMode.REQUEST ? 0 : maxMoves;
	}
}
