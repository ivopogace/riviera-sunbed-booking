package ai.riviera.platform.venue.vocabulary;

import java.time.LocalTime;

/**
 * The booking-relevant facts about one set, for {@code booking} via
 * {@code SetBookingFacts#setBookingInfo} so it never reads venue tables (invariant #11):
 * {@code pool} for the online-pool rule (#3), {@code price} (minor units, #5), {@code salesClose}
 * (the sale gate, #4) and {@code bookingCutoff} (free cancellation, #10), both wall-clock
 * {@code Europe/Tirane}; {@code bookingMode}, {@code seasonClosure} and {@code maxStayDays}
 * ({@code null}: any length) for the reserve fences; names for the summary.
 */
public record SetBookingInfo(SetId setId, VenueId venueId, String venueName, String rowLabel,
		int positionNo, Pool pool, MoneyView price, LocalTime bookingCutoff,
		LocalTime salesClose, BookingMode bookingMode, SeasonClosure seasonClosure,
		Integer maxStayDays) {
}
