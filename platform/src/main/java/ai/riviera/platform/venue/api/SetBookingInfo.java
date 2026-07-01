package ai.riviera.platform.venue.api;

import java.time.LocalTime;

/**
 * The booking-relevant facts about a single set, resolved by id (issue #6). Consumed by the
 * {@code booking} module (U3) to: enforce the online-pool rule (invariant #3) before
 * claiming, record the booking amount from {@code price} (integer minor units, invariant
 * #5), compute the evening-before cutoff from {@code bookingCutoff} (a wall-clock
 * {@code LocalTime} in {@code Europe/Tirane}, invariant #4), and build the booking
 * confirmation summary (venue name + set label).
 *
 * <p>{@code pool} is the same string token the database CHECK stores ({@code "ONLINE"} /
 * {@code "WALK_IN"}). Returned via {@link SetBookingFacts#setBookingInfo} so booking never
 * reads venue's tables (invariant #11).
 */
public record SetBookingInfo(SetId setId, VenueId venueId, String venueName, String rowLabel,
		int positionNo, String pool, MoneyView price, LocalTime bookingCutoff) {
}
