package ai.riviera.platform.booking.application.cancel;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The facts a {@code CONFIRMED → CANCELLED} transition {@code RETURNING}s (U6) — built atomically
 * with the update so the caller frees every {@code (set, date)} of the span ({@code bookingDate} to
 * {@code lastDate}), issues the refund, and publishes
 * {@code BookingCancelled} without a second read (the cancel sibling of {@link ConfirmedBooking}).
 * Money is integer minor units + ISO currency (invariant #5).
 */
public record CancelledBooking(long id, VenueId venueId, SetId setId, LocalDate bookingDate,
		LocalDate lastDate, long amountMinor, String currency) {
}
