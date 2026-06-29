package ai.riviera.platform.booking.application.out;

import java.time.LocalDate;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The booking facts a confirm transition yields, returned by {@link Bookings#confirm} /
 * {@link Bookings#confirmFromPayment} via SQL {@code RETURNING}. This lets the single confirm seam
 * build the {@code BookingConfirmed} event payload <em>atomically</em> with the transition — the
 * webhook path holds only a {@code bookingId}, so reading these back in a second query would race
 * (the row could change between confirm and read). Ids are typed (invariant #11); money is integer
 * minor units + ISO currency (invariant #5).
 */
public record ConfirmedBooking(long id, VenueId venueId, SetId setId, LocalDate bookingDate,
		long amountMinor, String currency) {
}
