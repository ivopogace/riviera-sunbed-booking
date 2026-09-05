package ai.riviera.platform.venue.vocabulary;

import java.time.LocalTime;

/**
 * The booking-relevant facts about a single set, resolved by id. Consumed by the {@code booking}
 * module to: enforce the online-pool rule on {@code pool} (invariant #3) before claiming, record
 * the booking amount from {@code price} (integer minor units, invariant #5), gate the sale on
 * {@code salesClose} and compute free-cancellation from {@code bookingCutoff} (both wall-clock
 * {@code LocalTime} in {@code Europe/Tirane}, invariant #4), and build the booking confirmation
 * summary (venue name + set label).
 *
 * <p>{@code bookingMode} tells the reserve flow whether the venue auto-confirms ({@code INSTANT})
 * or the booking starts as a pending request ({@code REQUEST}). Returned via
 * {@link SetBookingFacts#setBookingInfo} so booking never reads venue's tables (invariant #11).
 */
public record SetBookingInfo(SetId setId, VenueId venueId, String venueName, String rowLabel,
		int positionNo, Pool pool, MoneyView price, LocalTime bookingCutoff,
		LocalTime salesClose, BookingMode bookingMode) {
}
